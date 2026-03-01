"""
Semantic evaluation of conversation quality using Gemini.

Called once at submit time to supplement the metric-based scoring engine
with actual content analysis of what the developer typed.

Returns SemanticEval with:
  - prompt_quality_score      (0–10): Are prompts specific and grounded?
  - response_engagement_score (0–10): Does the developer critically engage?
  - interpretation             (str):  Personalized 2–4 sentence feedback

If the API call fails for any reason, returns None — the engine falls back
to pure metric-based scoring gracefully.
"""

import json
import logging
import os
from typing import Optional

from google import genai
from google.genai import types
from pydantic import BaseModel

logger = logging.getLogger(__name__)

_client: Optional[genai.Client] = None
_configured_key: Optional[str] = None


def _get_client() -> Optional[genai.Client]:
    global _client, _configured_key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    if api_key != _configured_key:
        _client = genai.Client(api_key=api_key)
        _configured_key = api_key
    return _client


# ─── Output model ──────────────────────────────────────────────────────────

class SemanticEval(BaseModel):
    prompt_quality_score: float        # 0–10
    response_engagement_score: float   # 0–10
    interpretation: str                # 2–4 sentences, personalized


# ─── Evaluator prompt ──────────────────────────────────────────────────────

_EVAL_SYSTEM_PROMPT = """
You are an expert evaluator assessing how well a developer used AI assistance
during a 60-minute coding exercise. They were implementing delayed job execution
(enqueue_in / enqueue_at) in the RQ (Redis Queue) Python library.

You will receive a full conversation transcript between the developer and the AI.
Evaluate the developer on two dimensions and write a short personalized interpretation.

Return ONLY valid JSON — no markdown fences, no explanation, just the object:
{
  "prompt_quality_score": <float 0-10>,
  "response_engagement_score": <float 0-10>,
  "interpretation": "<2-4 sentence string>"
}

─── Scoring guide ────────────────────────────────────────────────────────────

prompt_quality_score (0–10):
  Are the prompts specific, grounded in the actual codebase, and purposeful?
  8–10  Prompts name specific files/classes/functions, explain what was already
        tried, ask targeted questions that show real codebase understanding.
  5–7   Mix of specific and vague — some context, but inconsistent.
  2–4   Mostly generic questions that could apply to any codebase.
  0–1   Asks AI to write entire solutions with no reference to actual code,
        or just pastes error messages without context.

response_engagement_score (0–10):
  Does the developer critically engage with what the AI says?
  8–10  Follow-ups build on the AI's answer, challenge suggestions,
        ask for alternatives, quote or reference what the AI said.
  5–7   Some critical engagement, but also passive acceptance.
  2–4   Mostly applies AI output without questioning or building on it.
  0–1   Treats AI as a code generator — applies output with zero dialogue.

interpretation:
  2–4 sentences of personalized, specific feedback.
  - Reference what the developer actually said or did (specific, not generic).
  - Lead with what they did well, then what to improve.
  - Be concrete: "you asked about enqueue_call in queue.py" not "you asked specific questions".
  - Name the actual skill demonstrated or missed (e.g. problem decomposition,
    evidence-grounded follow-ups, blind adoption, test-then-edit discipline).
""".strip()


# ─── Helpers ───────────────────────────────────────────────────────────────

def _format_transcript(history: list[dict]) -> str:
    """Render conversation history as a readable evaluator transcript."""
    lines = []
    for turn in history:
        role = turn.get("role", "")
        content = turn.get("content", "")
        if role == "user":
            lines.append(f"DEVELOPER: {content}")
        elif role == "assistant":
            # Truncate long AI responses to keep the eval prompt lean
            if len(content) > 800:
                content = content[:800] + "... [truncated]"
            lines.append(f"AI ASSISTANT: {content}")
    return "\n\n".join(lines)


def _parse_response(raw: str) -> Optional[dict]:
    """Try to parse JSON from the model response, handling minor formatting issues."""
    raw = raw.strip()
    # Strip markdown fences if the model ignored the instruction
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Last resort: find the first { ... } block
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass
    return None


# ─── Public entry point ────────────────────────────────────────────────────

async def evaluate_conversation(conversation_history: list[dict]) -> Optional[SemanticEval]:
    """
    Semantically evaluate the developer's conversation quality via Gemini.

    Returns a SemanticEval with blendable scores and a personalized
    interpretation, or None if the call fails (engine falls back to metrics).
    """
    client = _get_client()
    if client is None:
        logger.warning("SemanticEval skipped — GEMINI_API_KEY not set")
        return None

    user_turns = [t for t in conversation_history if t.get("role") == "user"]
    if not user_turns:
        return None  # Nothing to evaluate

    transcript = _format_transcript(conversation_history)
    prompt = f"Here is the full conversation to evaluate:\n\n{transcript}"

    try:
        response = await client.aio.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config=types.GenerateContentConfig(
                system_instruction=_EVAL_SYSTEM_PROMPT,
                max_output_tokens=512,
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )

        data = _parse_response(response.text)
        if data is None:
            logger.warning("SemanticEval: could not parse JSON from response")
            return None

        return SemanticEval(
            prompt_quality_score=float(max(0.0, min(10.0, data["prompt_quality_score"]))),
            response_engagement_score=float(max(0.0, min(10.0, data["response_engagement_score"]))),
            interpretation=str(data["interpretation"]).strip(),
        )

    except Exception as exc:
        logger.warning("SemanticEval failed — falling back to metric scoring: %s", exc)
        return None
