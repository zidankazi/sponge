"""
Code analysis module — evaluates final_code via Gemini.

Scores:
  B1: Clarity/Readability (0-8)
  B2: Correctness-Oriented Design (0-7)
  B3: Efficiency Awareness (0-5)
  P3: Critical miss detection (bool)

Returns CodeSemanticEval or None on any failure.
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


# ── Output model ──────────────────────────────────────────────────────────

class CodeSemanticEval(BaseModel):
    """Code quality evaluation for the scoring engine."""
    b1_clarity: float           # 0-8: Clarity/Readability
    b2_correctness: float       # 0-7: Correctness-Oriented Design
    b3_efficiency_code: float   # 0-5: Efficiency Awareness
    p3_critical_miss: bool      # True if core requirement is missing
    p3_details: str             # What's missing (if p3_critical_miss is True)
    code_feedback: str          # Brief feedback on code quality


# ── System prompt ─────────────────────────────────────────────────────────

_CODE_EVAL_SYSTEM_PROMPT = """
You are an expert code reviewer evaluating a developer's modifications to the RQ (Redis Queue) Python library. The developer was tasked with implementing delayed job execution:

TASK REQUIREMENTS:
1. Add enqueue_in(seconds, func, *args, **kwargs) to the Queue class
2. Add enqueue_at(datetime, func, *args, **kwargs) to the Queue class
3. A job scheduled for time T must not execute before T
4. A job scheduled in the past should run immediately
5. All existing behavior (regular enqueue, workers, etc.) must still work

You will receive the developer's modified code files. Evaluate the code on three dimensions, check for critical missing requirements, and provide brief feedback.

Return ONLY valid JSON — no markdown fences:
{
  "b1_clarity": <float 0-8>,
  "b2_correctness": <float 0-7>,
  "b3_efficiency_code": <float 0-5>,
  "p3_critical_miss": <bool>,
  "p3_details": "<string>",
  "code_feedback": "<string>"
}

── SCORING RUBRIC ──

B1 — Clarity/Readability (0-8):
  0: Messy, unclear, inconsistent formatting
  3: Mostly readable but naming or structure doesn't match RQ conventions
  5: Clean code with good names, reasonable function length
  6: Clean, good names, and modular
  8: Very clean, modular, consistent with RQ codebase style (snake_case, docstrings matching existing patterns, same import style)

B2 — Correctness-Oriented Design (0-7):
  0: Data structures and flow don't match the problem
  3: Some alignment but awkward implementation (e.g. using lists instead of sorted sets for scheduling)
  5: Appropriate data structures with coherent flow (sorted set for time-ordered scheduling, proper Redis key management)
  7: Strong alignment — clear invariants, proper use of Redis sorted sets, correct status transitions, handles edge cases in data structures

B3 — Efficiency Awareness (0-5):
  0: Obviously inefficient (e.g. polling every 0.1s, O(n) scans where O(log n) is possible)
  2: Reasonable but not optimal (e.g. adequate but could use better Redis primitives)
  4: Good efficiency — uses appropriate Redis commands (ZADD, ZRANGEBYSCORE for time-based queries)
  5: Excellent — efficient data structures, minimal Redis round trips, batch operations where appropriate

── P3 CRITICAL MISS ──

Set p3_critical_miss to TRUE if ANY of these are missing:
1. No enqueue_in method on Queue class (or it's not callable)
2. No enqueue_at method on Queue class (or it's not callable)
3. Existing enqueue() method is broken or removed

Set p3_critical_miss to FALSE if all three exist and appear functional.
p3_details: If critical miss, explain what's missing. If no miss, set to empty string.

── CODE FEEDBACK ──
Write 2-3 sentences of specific feedback about the code quality. Reference actual code patterns, naming choices, or structural decisions. Be constructive.
""".strip()


# ── Helpers ───────────────────────────────────────────────────────────────

def _parse_response(raw: str) -> Optional[dict]:
    """Try to parse JSON from the model response."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass
    return None


def _clamp(val, lo, hi) -> float:
    return float(max(lo, min(hi, val)))


# ── Public entry point ────────────────────────────────────────────────────

async def analyze_final_code(final_code: str) -> Optional[CodeSemanticEval]:
    """
    Evaluate the submitted code via Gemini for code quality and P3 detection.

    Returns CodeSemanticEval with B1/B2/B3 scores, P3 critical miss flag,
    and code feedback. Returns None if the call fails.
    """
    client = _get_client()
    if client is None:
        logger.warning("CodeAnalysis skipped — GEMINI_API_KEY not set")
        return None

    if not final_code or not final_code.strip():
        return None

    prompt = f"Here is the developer's submitted code:\n\n{final_code}"

    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config=types.GenerateContentConfig(
                system_instruction=_CODE_EVAL_SYSTEM_PROMPT,
                max_output_tokens=512,
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )

        data = _parse_response(response.text)
        if data is None:
            logger.warning("CodeAnalysis: could not parse JSON from response")
            return None

        return CodeSemanticEval(
            b1_clarity=_clamp(data.get("b1_clarity", 4), 0, 8),
            b2_correctness=_clamp(data.get("b2_correctness", 3.5), 0, 7),
            b3_efficiency_code=_clamp(data.get("b3_efficiency_code", 2.5), 0, 5),
            p3_critical_miss=bool(data.get("p3_critical_miss", False)),
            p3_details=str(data.get("p3_details", "")).strip(),
            code_feedback=str(data.get("code_feedback", "")).strip(),
        )

    except Exception as exc:
        logger.warning("CodeAnalysis failed — falling back to defaults: %s", exc)
        return None
