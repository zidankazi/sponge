"""
Semantic evaluation of conversation quality using Gemini.

Evaluates 12 sub-criteria from the developer-AI conversation transcript:
  A: a1_understanding, a2_decomposition, a3_justification, a4_edge_cases
  B: b3_efficiency_discussion, b4_ownership_dialogue
  C: c2_test_mentions, c3_ai_questioning
  D: d1_narration, d2_tradeoffs, d3_ai_balance, d4_status_updates

Returns ConversationSemanticEval or None on any failure.
The engine falls back to pure metric-based scoring gracefully.
"""

import json
import logging
import os
from typing import Optional

from google import genai
from google.genai import types
from pydantic import BaseModel

from gemini.fallback import generate_with_fallback

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


# ── Output models ─────────────────────────────────────────────────────────

class ConversationSemanticEval(BaseModel):
    """12-dimension conversation evaluation for the scoring engine."""
    a1_understanding: float      # 0-6: Problem understanding & restatement
    a2_decomposition: float      # 0-7: Decomposition / plan
    a3_justification: float      # 0-7: Algorithm/approach justification
    a4_edge_cases: float         # 0-5: Edge cases before coding
    b3_efficiency_discussion: float  # 0-5: Efficiency discussion in conversation
    b4_ownership_dialogue: float    # 0-5: AI code ownership dialogue
    c2_test_mentions: float      # 0-9: Test coverage mentions
    c3_ai_questioning: float     # 0-4: AI output questioning/validation
    d1_narration: float          # 0-8: Continuous narration
    d2_tradeoffs: float          # 0-7: Tradeoffs and decisions
    d3_ai_balance: float         # 0-5: AI collaboration balance
    d4_status_updates: float     # 0-5: Status summaries
    interpretation: str          # Personalized feedback paragraph

    # Backward compatibility properties for the legacy semantic_eval interface
    @property
    def prompt_quality_score(self) -> float:
        """Legacy compat: maps to D1 narration scaled to 0-10."""
        return round(self.d1_narration / 8 * 10, 1)

    @property
    def response_engagement_score(self) -> float:
        """Legacy compat: maps to B4 ownership dialogue scaled to 0-10."""
        return round(self.b4_ownership_dialogue / 5 * 10, 1)


# Keep legacy model for reference
class SemanticEval(BaseModel):
    prompt_quality_score: float
    response_engagement_score: float
    interpretation: str


# ── System prompt ─────────────────────────────────────────────────────────

_EVAL_SYSTEM_PROMPT = """
You are an expert evaluator assessing how a developer used AI assistance during a 60-minute coding exercise. They were implementing delayed job execution (enqueue_in / enqueue_at) in the RQ (Redis Queue) Python library.

You will receive a numbered conversation transcript. Evaluate the developer on 12 dimensions and write personalized feedback.

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "a1_understanding": <float>,
  "a2_decomposition": <float>,
  "a3_justification": <float>,
  "a4_edge_cases": <float>,
  "b3_efficiency_discussion": <float>,
  "b4_ownership_dialogue": <float>,
  "c2_test_mentions": <float>,
  "c3_ai_questioning": <float>,
  "d1_narration": <float>,
  "d2_tradeoffs": <float>,
  "d3_ai_balance": <float>,
  "d4_status_updates": <float>,
  "interpretation": "<string>"
}

── SCORING RUBRIC ──

A1 — Problem Understanding & Restatement (0-6):
  0: No restatement of the problem at all
  2: Partial restatement, misses key constraints (e.g. "add scheduling" without mentioning enqueue_in/enqueue_at)
  4: Correct restatement with inputs/outputs identified
  6: Full restatement with constraints (must not execute before time T, past datetime runs immediately) and success criteria

A2 — Decomposition / Plan (0-7):
  0: No plan or decomposition visible in conversation
  3: Vague steps ("first I'll understand the code, then implement")
  5: Clear ordered steps with specific files/functions named
  7: Detailed plan with dependencies between steps and verification checkpoints

A3 — Algorithm/Approach Justification (0-7):
  0: No justification for approach — just asks AI to implement it
  3: Names a technique or approach but gives no rationale
  5: Provides correct rationale for chosen approach (e.g. "sorted set because we need time-ordered scheduling")
  7: Considers alternatives, states tradeoffs, explains why chosen approach fits the constraints

A4 — Edge Cases Before Coding (0-5):
  0: No edge cases mentioned
  2: 1-2 relevant edge cases identified (past datetime, empty queue)
  4: 3+ edge cases with some analysis of expected behavior
  5: Comprehensive edge cases including: past datetime, zero delay, negative delay, concurrent workers, empty queue

B3 — Efficiency Discussion (0-5):
  0: No efficiency considerations mentioned
  2: Mentions "performance" or "efficient" without specifics
  4: Discusses time/space complexity or specific data structure choices
  5: Analyzes efficiency tradeoffs with technical depth (e.g. "sorted set gives O(log n) insertion vs O(n) for a list")

B4 — AI Code Ownership Dialogue (0-5):
  0: Accepts AI output silently — no follow-up or questioning
  2: Occasional "thanks" or "ok" with minimal engagement
  3: Sometimes questions or builds on AI responses
  5: Consistently demonstrates understanding of AI output, asks clarifying questions, suggests modifications

C2 — Test Coverage Discussion (0-9):
  0: No mention of testing or test scenarios
  3: Mentions "testing" generically without scenarios
  5: Identifies specific test scenarios (happy path, past datetime, existing enqueue unchanged)
  7: Discusses failure modes, boundary conditions in test context
  9: Comprehensive test plan covering: happy path, edge cases, regression tests, error conditions

C3 — AI Output Questioning (0-4):
  0: Never questions or challenges AI suggestions
  1: One instance of questioning
  2: Occasionally pushes back or asks "are you sure?" or "what about..."
  4: Consistently validates AI output — asks for justification, suggests alternatives, spots potential issues

D1 — Continuous Narration (0-8):
  0: Terse commands only ("implement enqueue_in", "fix this error")
  3: Mix of commands and brief explanations
  5: Regularly explains intent before asking ("I want to understand how the worker loop checks for ready jobs, because...")
  8: Continuous narration — explains reasoning, states what they learned, describes their mental model

D2 — Tradeoffs and Decisions (0-7):
  0: No tradeoff discussion
  3: Vague mentions ("this is better") without technical substance
  5: Concrete tradeoffs with technical dimensions ("polling vs event-driven: polling is simpler but wastes CPU")
  7: Multiple tradeoffs discussed with explicit reasoning about why the chosen approach fits the constraints

D3 — AI Collaboration Balance (0-5):
  0: Either never uses AI or completely depends on it
  2: Uses AI but interactions feel mechanical (ask → receive → ask next thing)
  3: Mix of tactical and exploratory AI usage
  5: AI used as a thinking partner — developer leads direction, uses AI for specific knowledge gaps, builds on responses

D4 — Status Summaries (0-5):
  0: No status updates or checkpoints in conversation
  2: One or two "ok, now let me..." transitions
  4: Regular status updates summarizing progress and next steps
  5: Clear checkpoint discipline — summarizes what was done, what's next, and why

── INTERPRETATION GUIDELINES ──
Write 3-5 sentences of personalized, specific feedback:
- Reference what the developer actually said (quote or paraphrase specific moments)
- Lead with strengths, then areas for improvement
- Be concrete: "you asked about the worker loop in worker.py" not "you asked good questions"
- Name the actual skills demonstrated or missed
""".strip()


# ── Helpers ───────────────────────────────────────────────────────────────

def _format_transcript(history: list[dict]) -> str:
    """Render conversation history as a numbered evaluator transcript."""
    lines = []
    turn_num = 0
    for turn in history:
        role = turn.get("role", "")
        content = turn.get("content", "")
        if role == "user":
            turn_num += 1
            lines.append(f"TURN {turn_num} [DEVELOPER]: {content}")
        elif role == "assistant":
            turn_num += 1
            if len(content) > 800:
                content = content[:800] + "... [truncated]"
            lines.append(f"TURN {turn_num} [AI]: {content}")
    return "\n\n".join(lines)


def _parse_response(raw: str) -> Optional[dict]:
    """Try to parse JSON from the model response, handling minor formatting issues."""
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

async def evaluate_conversation(
    conversation_history: list[dict],
) -> Optional[ConversationSemanticEval]:
    """
    Semantically evaluate the developer's conversation quality via Gemini.

    Returns ConversationSemanticEval with 12 sub-criterion scores and
    personalized feedback, or None if the call fails.
    """
    client = _get_client()
    if client is None:
        logger.warning("SemanticEval skipped — GEMINI_API_KEY not set")
        return None

    user_turns = [t for t in conversation_history if t.get("role") == "user"]
    if not user_turns:
        return None

    transcript = _format_transcript(conversation_history)
    prompt = f"Here is the full conversation to evaluate:\n\n{transcript}"

    try:
        response = await generate_with_fallback(
            client,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config=types.GenerateContentConfig(
                system_instruction=_EVAL_SYSTEM_PROMPT,
                max_output_tokens=1024,
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )

        data = _parse_response(response.text)
        if data is None:
            logger.warning("SemanticEval: could not parse JSON from response")
            return None

        return ConversationSemanticEval(
            a1_understanding=_clamp(data.get("a1_understanding", 0), 0, 6),
            a2_decomposition=_clamp(data.get("a2_decomposition", 0), 0, 7),
            a3_justification=_clamp(data.get("a3_justification", 0), 0, 7),
            a4_edge_cases=_clamp(data.get("a4_edge_cases", 0), 0, 5),
            b3_efficiency_discussion=_clamp(data.get("b3_efficiency_discussion", 0), 0, 5),
            b4_ownership_dialogue=_clamp(data.get("b4_ownership_dialogue", 0), 0, 5),
            c2_test_mentions=_clamp(data.get("c2_test_mentions", 0), 0, 9),
            c3_ai_questioning=_clamp(data.get("c3_ai_questioning", 0), 0, 4),
            d1_narration=_clamp(data.get("d1_narration", 0), 0, 8),
            d2_tradeoffs=_clamp(data.get("d2_tradeoffs", 0), 0, 7),
            d3_ai_balance=_clamp(data.get("d3_ai_balance", 0), 0, 5),
            d4_status_updates=_clamp(data.get("d4_status_updates", 0), 0, 5),
            interpretation=str(data.get("interpretation", "")).strip(),
        )

    except Exception as exc:
        logger.warning("SemanticEval failed — falling back to metric scoring: %s", exc)
        return None
