"""
Gemini AIDE client.

Provides codebase-aware AI assistance for the Sponge coding exercise.
Uses the google-genai library (replaces deprecated google-generativeai)
with native async support — no asyncio.to_thread needed.

Edge cases handled:
  - Missing / invalid / expired API key
  - Rate limiting (429) and quota exhaustion
  - Model not found (wrong plan or model name)
  - Network timeouts and transient errors
  - Safety filter blocks and empty responses
  - Large codebase payloads (token budget + per-file truncation)
  - Long conversation history (trimming + alternating-role enforcement)
  - Duplicate user message in history (frontend includes current msg)
"""

import asyncio
import logging
import os
from typing import Optional

from google import genai
from google.genai import types

from gemini.config import GEMINI_MODEL_CHAIN
from gemini.fallback import generate_with_fallback
from .system_prompt import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# ─── Limits ────────────────────────────────────────────────────────────

MAX_CONTEXT_CHARS = 120_000   # ~30k tokens — safe under Gemini's 1M window
MAX_FILE_CHARS = 20_000       # Truncate any single file beyond this
MAX_HISTORY_TURNS = 40        # Keep last N turns to avoid token overflow
MAX_OUTPUT_TOKENS = 2048      # Cap response length — prevents one-shot dumps
GEMINI_TIMEOUT_S = 55         # Per-call timeout — Vercel Pro allows 60s


# ─── Lazy client initialization ────────────────────────────────────────

_client: Optional[genai.Client] = None
_configured_key: Optional[str] = None


def _get_client() -> Optional[genai.Client]:
    """
    Lazily initialize and cache the Gemini Client.
    Recreates the client only if the API key changes.
    Returns None if GEMINI_API_KEY is not set.
    """
    global _client, _configured_key

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None

    if api_key != _configured_key:
        _client = genai.Client(api_key=api_key)
        _configured_key = api_key

    return _client


# ─── Generation config ─────────────────────────────────────────────────

def _make_config() -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        max_output_tokens=MAX_OUTPUT_TOKENS,
        temperature=0.4,
        safety_settings=[
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT",        threshold="BLOCK_NONE"),
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH",        threshold="BLOCK_NONE"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT",  threshold="BLOCK_NONE"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT",  threshold="BLOCK_NONE"),
        ],
    )


# ─── Context builder ──────────────────────────────────────────────────

def _truncate(content: str, limit: int) -> str:
    """Truncate content with a visible marker so Gemini knows it's partial."""
    if len(content) <= limit:
        return content
    return content[:limit] + f"\n... [truncated — {len(content)} chars total]"


def _build_context_block(
    active_file: Optional[str],
    file_contents: Optional[dict[str, str]],
) -> str:
    """
    Build a codebase context string prepended to the user prompt.

    Strategy:
      1. Active file gets full content (up to MAX_FILE_CHARS) — shown first
      2. Remaining files fill the budget in sorted order
      3. Files that don't fit get a "[skipped]" marker so Gemini knows they exist
    """
    if not file_contents:
        return ""

    parts = []
    budget = MAX_CONTEXT_CHARS

    # Active file first — the developer is looking at this
    if active_file and active_file in file_contents:
        header = f"--- ACTIVE FILE: {active_file} ---"
        content = _truncate(file_contents[active_file], MAX_FILE_CHARS)
        block = f"{header}\n{content}"
        parts.append(block)
        budget -= len(block)

    # Remaining files, sorted for consistency across requests
    for path in sorted(file_contents.keys()):
        if path == active_file:
            continue

        header = f"\n--- {path} ---"

        if budget <= len(header) + 100:
            parts.append(f"\n--- {path} --- [skipped — context limit reached]")
            continue

        content = _truncate(file_contents[path], min(MAX_FILE_CHARS, budget - len(header)))
        block = f"{header}\n{content}"
        parts.append(block)
        budget -= len(block)

    return (
        "=== CODEBASE CONTEXT ===\n"
        + "\n".join(parts)
        + "\n=== END CODEBASE CONTEXT ===\n\n"
    )


# ─── History sanitizer ────────────────────────────────────────────────

def _sanitize_history(conversation_history: list[dict]) -> list[dict]:
    """
    Convert conversation history to Gemini's required Content format.

    Handles:
      - Role mapping: "assistant" → "model"
      - Empty/whitespace-only messages: dropped
      - Consecutive same-role messages: merged (Gemini requires alternation)
      - Over-long history: trimmed to MAX_HISTORY_TURNS
      - Must start with "user", end with "model"
        (new user turn is appended directly to contents in call_gemini)
    """
    if not conversation_history:
        return []

    history = conversation_history[-MAX_HISTORY_TURNS:]

    sanitized = []
    for turn in history:
        role = turn.get("role", "")
        content = (turn.get("content") or "").strip()

        if not content:
            continue

        gemini_role = "user" if role == "user" else "model"

        # Merge consecutive same-role messages
        if sanitized and sanitized[-1]["role"] == gemini_role:
            prev_text = sanitized[-1]["parts"][0]["text"]
            sanitized[-1]["parts"] = [{"text": prev_text + "\n\n" + content}]
        else:
            sanitized.append({"role": gemini_role, "parts": [{"text": content}]})

    # Must start with "user"
    while sanitized and sanitized[0]["role"] != "user":
        sanitized.pop(0)

    # Must end with "model" — the new user message is appended in call_gemini
    while sanitized and sanitized[-1]["role"] != "model":
        sanitized.pop()

    return sanitized


# ─── Response extractor ───────────────────────────────────────────────

def _extract_response(response) -> str:
    """
    Safely pull text from a Gemini response, handling:
      - Normal text responses
      - Safety-blocked responses (response.text raises ValueError)
      - Empty / malformed responses
    """
    # Fast path
    try:
        text = response.text
        if text and text.strip():
            return text.strip()
    except (ValueError, AttributeError):
        pass

    # Check if the prompt itself was blocked
    try:
        feedback = response.prompt_feedback
        if feedback and getattr(feedback, "block_reason", None):
            return (
                "Your message was flagged by content filters and I couldn't process it. "
                "Could you rephrase your question?"
            )
    except AttributeError:
        pass

    # Try extracting from candidates directly
    try:
        for candidate in response.candidates:
            if candidate.content and candidate.content.parts:
                for part in candidate.content.parts:
                    if hasattr(part, "text") and part.text and part.text.strip():
                        return part.text.strip()
    except (AttributeError, IndexError):
        pass

    return "I wasn't able to generate a response. Could you try rephrasing your question?"


# ─── Public async entry point ──────────────────────────────────────────

async def call_gemini(
    prompt: str,
    conversation_history: list[dict],
    active_file: Optional[str] = None,
    file_contents: Optional[dict[str, str]] = None,
) -> str:
    """
    Send a prompt to Gemini with codebase context and conversation history.

    Uses native async (client.aio) — no thread executor needed.
    Returns the AI response text. On ANY failure, returns a user-friendly
    error message (never raises).
    """
    client = _get_client()
    if client is None:
        logger.error("GEMINI_API_KEY is not set")
        return "The AI assistant is unavailable due to a configuration error."

    context_block = _build_context_block(active_file, file_contents)
    prompt_with_context = f"{context_block}{prompt}" if context_block else prompt

    # Build full contents: sanitized history + new user message
    gemini_history = _sanitize_history(conversation_history)
    contents = gemini_history + [{"role": "user", "parts": [{"text": prompt_with_context}]}]

    try:
        response = await asyncio.wait_for(
            generate_with_fallback(
                client,
                contents=contents,
                config=_make_config(),
            ),
            timeout=GEMINI_TIMEOUT_S,
        )
        if response is None:
            return (
                "The AI assistant is temporarily rate-limited. "
                "Please wait a moment and try again."
            )
        return _extract_response(response)

    except asyncio.TimeoutError:
        logger.warning("Gemini API call timed out after %ds", GEMINI_TIMEOUT_S)
        return (
            "The AI assistant timed out. "
            "Try a shorter question or try again in a moment."
        )

    except Exception as exc:
        logger.exception("Gemini API call failed")
        err = str(exc).lower()

        if "quota" in err or "rate" in err or "429" in err or "resource_exhausted" in err:
            return (
                "The AI assistant is temporarily rate-limited. "
                "Please wait a moment and try again."
            )
        if "api key" in err or "api_key" in err or "401" in err or "403" in err:
            return "The AI assistant is unavailable due to a configuration error."
        if "not found" in err or "404" in err:
            return "The AI assistant is temporarily unavailable. Please try again."
        if "block" in err or "safety" in err or "filter" in err:
            return (
                "Your message was flagged by content filters. "
                "Could you rephrase your question?"
            )

        return "The AI assistant encountered an error. Please try again."
