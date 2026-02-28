"""
Gemini AIDE client.

Provides codebase-aware AI assistance for the Sponge coding exercise.
Uses Google's Gemini API with full codebase context, conversation history,
and behavioral guardrails to guide (not solve) the developer's work.

Edge cases handled:
  - Missing / invalid / expired API key
  - Rate limiting (429) and quota exhaustion
  - Model not found (wrong plan or model name)
  - Network timeouts and transient errors
  - Safety filter blocks and empty responses
  - Large codebase payloads (token budget + per-file truncation)
  - Long conversation history (trimming + alternating-role enforcement)
  - Duplicate user message in history (frontend includes current msg)
  - Concurrent requests (thread-safe via asyncio.to_thread)
"""

import asyncio
import logging
import os
from typing import Optional

import google.generativeai as genai

logger = logging.getLogger(__name__)

# ─── Limits ────────────────────────────────────────────────────────────

MAX_CONTEXT_CHARS = 120_000   # ~30k tokens — safe under Gemini's 1M window
MAX_FILE_CHARS = 20_000       # Truncate any single file beyond this
MAX_HISTORY_TURNS = 40        # Keep last N turns to avoid token overflow
MAX_OUTPUT_TOKENS = 2048      # Cap response length — prevents one-shot dumps


# ─── System prompt ─────────────────────────────────────────────────────

SYSTEM_PROMPT = """
You are an AI-assisted development environment (AIDE) embedded in a timed 60-minute coding exercise.

## The Task
The developer is extending the RQ (Redis Queue) Python library to support delayed job execution:
- Add `enqueue_in(seconds, func, *args, **kwargs)` to Queue
- Add `enqueue_at(datetime, func, *args, **kwargs)` to Queue
- Jobs scheduled for time T must not execute before T
- Jobs scheduled in the past should be treated as immediately ready
- All existing RQ behavior must continue to work unchanged

## Your Role
You are a knowledgeable pair-programming partner. The full codebase is provided with each message. The ACTIVE FILE is what the developer currently has open in their editor.

### DO:
- Reference specific files, functions, and line numbers from the codebase context
- Ask clarifying questions when the developer's intent is ambiguous
- Explain concepts by pointing to the actual code they're working with
- When asked to help with a change: explain WHAT needs to change, WHERE in the code, and WHY — then show a small, targeted code snippet (under 15 lines)
- Encourage the developer to run tests after changes
- Suggest the next small step after each answer
- Use markdown formatting with ```python code blocks

### DO NOT:
- Write a complete implementation of enqueue_in/enqueue_at/ScheduledJobRegistry in a single response
- Provide more than ~15 lines of new code in any single response
- Generate code without explaining the reasoning behind it
- Make up file paths, function signatures, or API details not present in the codebase context
- Skip explanation in favor of dumping code
- Solve the entire problem if the developer asks a broad question — break it into steps

### Response Pattern:
1. Acknowledge what the developer is asking (1 sentence)
2. Point to the relevant code in the codebase context (file + line/function)
3. Explain the approach or answer (2–4 sentences)
4. If code is needed, show a small targeted snippet
5. End with a clear next step or question

Be concise — this is a timed exercise.
""".strip()


# ─── Safety settings (relaxed for code content) ───────────────────────

SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]


# ─── Lazy model initialization ────────────────────────────────────────

_model = None
_configured_key = None


def _get_model():
    """
    Lazily initialize and cache the GenerativeModel.
    Reconfigures only if the API key changes (e.g. .env hot-reload).
    Returns None if GEMINI_API_KEY is not set.
    """
    global _model, _configured_key

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None

    if api_key != _configured_key:
        genai.configure(api_key=api_key)
        _configured_key = api_key
        _model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=SYSTEM_PROMPT,
            safety_settings=SAFETY_SETTINGS,
            generation_config={
                "max_output_tokens": MAX_OUTPUT_TOKENS,
                "temperature": 0.4,
            },
        )

    return _model


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
    Convert conversation history to Gemini's required format.

    Handles:
      - Role mapping: "assistant" → "model"
      - Empty/whitespace-only messages: dropped
      - Consecutive same-role messages: merged (Gemini requires alternation)
      - Over-long history: trimmed to MAX_HISTORY_TURNS
      - Last message must be "model" (since send_message sends the new user turn)
      - First message must be "user" (Gemini requirement)
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

        # Merge consecutive same-role messages (Gemini rejects non-alternating)
        if sanitized and sanitized[-1]["role"] == gemini_role:
            sanitized[-1]["parts"] = [sanitized[-1]["parts"][0] + "\n\n" + content]
        else:
            sanitized.append({"role": gemini_role, "parts": [content]})

    # Must start with "user"
    while sanitized and sanitized[0]["role"] != "user":
        sanitized.pop(0)

    # Must end with "model" — the new user message goes via send_message()
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


# ─── Sync Gemini call (run in thread) ─────────────────────────────────

def _call_gemini_sync(
    prompt_with_context: str,
    conversation_history: list[dict],
) -> str:
    """Synchronous Gemini call — invoked via asyncio.to_thread."""
    model = _get_model()
    if model is None:
        return (
            "**Gemini unavailable** — `GEMINI_API_KEY` is not set. "
            "Add it to `backend/.env` and restart the server."
        )

    gemini_history = _sanitize_history(conversation_history)
    chat = model.start_chat(history=gemini_history)
    response = chat.send_message(prompt_with_context)
    return _extract_response(response)


# ─── Public async entry point ──────────────────────────────────────────

async def call_gemini(
    prompt: str,
    conversation_history: list[dict],
    active_file: Optional[str] = None,
    file_contents: Optional[dict[str, str]] = None,
) -> str:
    """
    Send a prompt to Gemini with codebase context and conversation history.

    Returns the AI response text. On ANY failure, returns a user-friendly
    error message (never raises — the frontend always gets a displayable string).
    """
    context_block = _build_context_block(active_file, file_contents)
    prompt_with_context = f"{context_block}{prompt}" if context_block else prompt

    try:
        return await asyncio.to_thread(
            _call_gemini_sync, prompt_with_context, conversation_history
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
            return (
                "**Gemini API key error** — the key may be invalid or expired. "
                "Check `backend/.env`."
            )
        if "not found" in err or "404" in err:
            return (
                "**Model not available** — `gemini-2.5-flash` may not be accessible "
                "with your API key. Check your Google AI Studio plan."
            )
        if "timeout" in err or "deadline" in err or "504" in err:
            return (
                "The AI assistant timed out. "
                "Try a shorter question or try again in a moment."
            )
        if "block" in err or "safety" in err or "filter" in err:
            return (
                "Your message was flagged by content filters. "
                "Could you rephrase your question?"
            )

        return "The AI assistant encountered an error. Please try again."
