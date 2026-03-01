"""
Gemini-powered insights generator for scoring results.

Replaces the old template-based interpretation.py with dynamic,
personalised suggestions derived from the user's actual prompts,
their scoring data, and evaluation results.

Inputs:
  - user_prompts: the developer's actual chat messages
  - rubric_breakdown: category scores (A/B/C/D)
  - sub_criteria: 16 sub-criterion scores
  - headline_metrics: 8 rate metrics from the event log
  - penalty_detail: P1/P2/P3 penalties
  - test_suite: test pass/fail results
  - total_score: final 0-100 score
  - conv_eval: optional Gemini conversation eval (for extra context)

Output:
  - List of Insight objects (category, type, title, description)
  - Falls back to metric-based insights if Gemini is unavailable
"""

import json
import logging
import os
from typing import Optional

from google import genai
from google.genai import types

from gemini.config import GEMINI_MODEL_CHAIN
from gemini.fallback import generate_with_fallback
from models.score import (
    Insight, HeadlineMetrics, RubricBreakdown,
    SubCriteriaDetail, PenaltyDetail, TestSuiteResult,
)

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


# ── System prompt for insight generation ─────────────────────────────────

_INSIGHTS_SYSTEM_PROMPT = """
You are an expert coding coach reviewing how a developer used AI assistance during a 60-minute coding exercise implementing delayed job execution (enqueue_in / enqueue_at) in the RQ (Redis Queue) Python library.

You will receive:
1. The developer's actual prompts (numbered with [index]) — what they typed to the AI
2. Their scoring breakdown across 4 rubric categories
3. Category thresholds for tier assignment
4. Detailed sub-criteria scores
5. Behavioural metrics from event logs
6. Penalty information
7. Test results

Generate 3-6 specific, actionable insights across THREE tiers:
- "strength": category scored ≥60% of its max — something they did well
- "improvement": category scored 30-60% of its max — room to grow
- "weakness": category scored <30% of its max — critical area needing attention

Each insight should reference what the developer actually did (or didn't do), be concrete and specific, and include a clear actionable suggestion.

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "insights": [
    {
      "category": "<Problem Solving | Code Quality | Verification | Communication>",
      "type": "<strength | improvement | weakness>",
      "title": "<short 3-8 word title>",
      "description": "<1-2 sentence specific observation + actionable suggestion>",
      "prompt_indices": [0, 3]
    }
  ]
}

The "prompt_indices" field is a list of 0-based indices referencing which developer prompts are relevant to this insight. Include 1-3 indices when the insight relates to specific prompts. Use an empty list [] if the insight is about general behaviour.

RULES:
- Include at least 1 strength (if any category ≥60% of max)
- Include at least 1 improvement
- Include weaknesses for any category scoring <30% of max
- Max 6 insights total
- Strengths should be genuine — don't invent praise for low scores
- For zero-effort sessions (no prompts, no edits), return 2-3 insights:
  weaknesses noting the session was incomplete, one encouraging them to try
- Reference actual prompt content when possible (quote 3-5 words)
- Be encouraging but honest — this is a learning tool
- Title should be punchy and memorable
- Description should be specific to THIS session, not generic
""".strip()


# ── Build the evaluation context for Gemini ──────────────────────────────

def _build_insights_prompt(
    user_prompts: list[str],
    total_score: int,
    rubric: Optional[RubricBreakdown],
    sub_criteria: Optional[SubCriteriaDetail],
    metrics: Optional[HeadlineMetrics],
    penalties: Optional[PenaltyDetail],
    test_suite: Optional[TestSuiteResult],
) -> str:
    """Assemble the evaluation context as a structured prompt for Gemini."""
    sections = []

    # 1. User prompts (0-indexed so Gemini can reference them)
    if user_prompts:
        prompt_lines = []
        for i, p in enumerate(user_prompts[:15]):  # cap at 15 prompts
            text = p[:300] + "..." if len(p) > 300 else p
            prompt_lines.append(f"  [{i}] {text}")
        sections.append("DEVELOPER PROMPTS:\n" + "\n".join(prompt_lines))
    else:
        sections.append("DEVELOPER PROMPTS: (none — developer did not use the AI assistant)")

    # 2. Total score
    sections.append(f"TOTAL SCORE: {total_score}/100")

    # 3. Rubric breakdown
    if rubric:
        sections.append(
            "RUBRIC BREAKDOWN:\n"
            f"  Problem Solving:  {rubric.problem_solving}/12\n"
            f"  Code Quality:     {rubric.code_quality}/13\n"
            f"  Verification:     {rubric.verification}/12\n"
            f"  Communication:    {rubric.communication}/13"
        )

    # 3b. Category thresholds for tier assignment
    if rubric:
        sections.append(
            "CATEGORY THRESHOLDS (for tier assignment):\n"
            "  Problem Solving: max 12 → strength ≥7.2, weakness <3.6\n"
            "  Code Quality:    max 13 → strength ≥7.8, weakness <3.9\n"
            "  Verification:    max 12 → strength ≥7.2, weakness <3.6\n"
            "  Communication:   max 13 → strength ≥7.8, weakness <3.9"
        )

    # 4. Sub-criteria (only non-zero ones to save tokens)
    if sub_criteria:
        sc = sub_criteria.model_dump()
        non_zero = {k: v for k, v in sc.items() if v > 0}
        if non_zero:
            lines = [f"  {k}: {v}" for k, v in non_zero.items()]
            sections.append("SUB-CRITERIA (non-zero):\n" + "\n".join(lines))
        else:
            sections.append("SUB-CRITERIA: all zero (no meaningful activity detected)")

    # 5. Headline metrics
    if metrics:
        m = metrics.model_dump()
        lines = []
        for k, v in m.items():
            if isinstance(v, float) and v >= 0:
                lines.append(f"  {k}: {round(v * 100)}%")
            elif isinstance(v, float) and v < 0:
                lines.append(f"  {k}: N/A")
        if lines:
            sections.append("BEHAVIOURAL METRICS:\n" + "\n".join(lines))

    # 6. Penalties
    if penalties:
        p = penalties.model_dump()
        active = {k: v for k, v in p.items() if v != 0}
        if active:
            lines = [f"  {k}: {v}" for k, v in active.items()]
            sections.append("PENALTIES APPLIED:\n" + "\n".join(lines))
        else:
            sections.append("PENALTIES: none")

    # 7. Test results
    if test_suite:
        sections.append(
            f"TEST RESULTS: {test_suite.passed}/{test_suite.total} passed "
            f"({round(test_suite.pass_rate * 100)}% pass rate)"
        )
        if test_suite.core_failures:
            sections.append(
                f"  Core test failures: {', '.join(test_suite.core_failures[:5])}"
            )

    return "\n\n".join(sections)


# ── Parse Gemini response ────────────────────────────────────────────────

def _parse_insights_response(raw: str) -> Optional[list[dict]]:
    """Try to parse the JSON insights array from Gemini's response."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            try:
                data = json.loads(raw[start:end])
            except json.JSONDecodeError:
                return None
        else:
            return None

    if isinstance(data, dict) and "insights" in data:
        return data["insights"]
    if isinstance(data, list):
        return data
    return None


_VALID_CATEGORIES = {"Problem Solving", "Code Quality", "Verification", "Communication"}
_VALID_TYPES = {"strength", "improvement", "weakness"}


def _validate_insight(raw: dict, num_prompts: int = 0) -> Optional[Insight]:
    """Validate and clamp a single insight dict into an Insight model."""
    try:
        cat = str(raw.get("category", "")).strip()
        if cat not in _VALID_CATEGORIES:
            cat = "Communication"  # safe default

        itype = str(raw.get("type", "")).strip().lower()
        if itype not in _VALID_TYPES:
            itype = "improvement"

        title = str(raw.get("title", "")).strip()[:80]
        desc = str(raw.get("description", "")).strip()[:300]

        if not title or not desc:
            return None

        # Validate prompt_indices — clamp to valid range
        raw_indices = raw.get("prompt_indices", [])
        if isinstance(raw_indices, list) and num_prompts > 0:
            prompt_indices = [
                int(idx) for idx in raw_indices
                if isinstance(idx, (int, float)) and 0 <= int(idx) < num_prompts
            ][:3]  # max 3 refs
        else:
            prompt_indices = []

        return Insight(
            category=cat, type=itype, title=title,
            description=desc, prompt_indices=prompt_indices,
        )
    except Exception:
        return None


# ── Fallback: metric-based insights (no Gemini) ─────────────────────────

def _fallback_insights(
    user_prompts: list[str],
    total_score: int,
    metrics: Optional[HeadlineMetrics],
    rubric: Optional[RubricBreakdown],
    penalties: Optional[PenaltyDetail],
    test_suite: Optional[TestSuiteResult],
) -> list[Insight]:
    """Generate basic insights from metrics alone when Gemini is unavailable."""
    insights = []

    # Zero-effort detection
    if not user_prompts:
        insights.append(Insight(
            category="Communication",
            type="weakness",
            title="Session incomplete",
            description="No AI prompts were sent during this session. Try using the AI assistant to explore the codebase and discuss your approach.",
        ))
        insights.append(Insight(
            category="Problem Solving",
            type="weakness",
            title="No code changes detected",
            description="The session ended without meaningful code modifications. Start by reading the codebase and asking the AI about the problem structure.",
        ))
        if test_suite and test_suite.pass_rate > 0:
            insights.append(Insight(
                category="Verification",
                type="improvement",
                title="Some tests passing",
                description=f"{test_suite.passed}/{test_suite.total} tests passed from the base code. Editing the code and running tests iteratively can improve this.",
            ))
        return insights

    # Strengths
    if metrics and metrics.grounded_prompt_rate >= 0.5:
        insights.append(Insight(
            category="Communication",
            type="strength",
            title="Grounded prompts",
            description=f"{round(metrics.grounded_prompt_rate * 100)}% of your prompts referenced specific files or functions — this helps the AI give targeted answers.",
        ))

    if metrics and metrics.ai_modification_rate >= 0.6:
        insights.append(Insight(
            category="Code Quality",
            type="strength",
            title="Active code ownership",
            description=f"You modified code after {round(metrics.ai_modification_rate * 100)}% of AI responses — great habit of reviewing before accepting.",
        ))

    if metrics and metrics.test_after_ai_rate >= 0.4:
        insights.append(Insight(
            category="Verification",
            type="strength",
            title="Testing after AI suggestions",
            description=f"You ran tests after {round(metrics.test_after_ai_rate * 100)}% of AI interactions — strong verification discipline.",
        ))

    if rubric and rubric.problem_solving >= 8:
        insights.append(Insight(
            category="Problem Solving",
            type="strength",
            title="Strong problem analysis",
            description="You showed solid problem-solving skills by exploring the codebase and framing clear questions before diving into implementation.",
        ))

    # Weaknesses (critical issues — metrics far outside acceptable range)
    if metrics and metrics.blind_adoption_rate > 0.7:
        insights.append(Insight(
            category="Code Quality",
            type="weakness",
            title="Accepting AI output uncritically",
            description=f"{round(metrics.blind_adoption_rate * 100)}% of AI suggestions were applied without any edits. Always review and modify AI-generated code to match your understanding.",
        ))

    if metrics and metrics.grounded_prompt_rate < 0.15 and len(user_prompts) > 2:
        insights.append(Insight(
            category="Communication",
            type="weakness",
            title="Prompts lack code context",
            description="Almost none of your prompts referenced specific files or functions. Grounding prompts in code helps the AI give precise, relevant answers.",
        ))

    if rubric and rubric.verification < 3.6:  # <30% of 12
        insights.append(Insight(
            category="Verification",
            type="weakness",
            title="Minimal testing effort",
            description="Your verification score is very low. Running tests after each change and validating AI suggestions is critical to building reliable code.",
        ))

    # Improvements
    if metrics and metrics.blind_adoption_rate > 0.5 and metrics.blind_adoption_rate <= 0.7:
        insights.append(Insight(
            category="Code Quality",
            type="improvement",
            title="Review AI output before applying",
            description=f"{round(metrics.blind_adoption_rate * 100)}% of AI suggestions were used without edits. Try modifying each suggestion to fit your understanding.",
        ))

    if metrics and metrics.test_after_ai_rate < 0.2:
        insights.append(Insight(
            category="Verification",
            type="improvement",
            title="Run tests more frequently",
            description="Running tests after each AI suggestion helps catch issues early and shows strong verification discipline.",
        ))

    if metrics and metrics.grounded_prompt_rate < 0.3:
        insights.append(Insight(
            category="Communication",
            type="improvement",
            title="Reference specific code in prompts",
            description="Mentioning file names, function names, or line numbers in your prompts helps the AI give more precise, relevant answers.",
        ))

    if penalties and penalties.p2_no_run != 0:
        insights.append(Insight(
            category="Verification",
            type="improvement",
            title="Run the test suite",
            description="No test runs were detected during the session. Running tests validates your changes and is heavily weighted in scoring.",
        ))

    if metrics and metrics.passive_reprompt_rate > 0.3:
        insights.append(Insight(
            category="Communication",
            type="improvement",
            title="Vary your follow-up prompts",
            description=f"{round(metrics.passive_reprompt_rate * 100)}% of consecutive prompts were too similar. Build on AI responses rather than re-asking the same question.",
        ))

    # Ensure at least one of each required type
    has_strength = any(i.type == "strength" for i in insights)
    has_improvement = any(i.type == "improvement" for i in insights)

    if not has_strength and total_score > 0:
        insights.insert(0, Insight(
            category="Problem Solving",
            type="strength",
            title="You gave it a shot",
            description=f"You engaged with the exercise and scored {total_score}/100. Every session is a learning opportunity.",
        ))

    if not has_improvement:
        insights.append(Insight(
            category="Communication",
            type="improvement",
            title="Keep iterating",
            description="Try building longer back-and-forth conversations with the AI — challenge its suggestions and refine your approach.",
        ))

    # Ensure weakness for very low total scores
    has_weakness = any(i.type == "weakness" for i in insights)
    if not has_weakness and total_score < 30:
        insights.append(Insight(
            category="Problem Solving",
            type="weakness",
            title="Score below expectations",
            description=f"Your total score of {total_score}/100 suggests significant areas for improvement. Focus on breaking the problem into smaller steps and verifying each one.",
        ))

    return insights[:6]


# ── Public entry point ───────────────────────────────────────────────────

async def generate_insights(
    user_prompts: list[str],
    total_score: int,
    rubric: Optional[RubricBreakdown] = None,
    sub_criteria: Optional[SubCriteriaDetail] = None,
    metrics: Optional[HeadlineMetrics] = None,
    penalties: Optional[PenaltyDetail] = None,
    test_suite: Optional[TestSuiteResult] = None,
) -> list[Insight]:
    """
    Generate personalised scoring insights via Gemini.

    Falls back to metric-based insights if Gemini is unavailable or fails.
    Always returns 2-5 Insight objects.
    """
    client = _get_client()
    if client is None:
        logger.warning("Insights generation skipped — GEMINI_API_KEY not set")
        return _fallback_insights(user_prompts, total_score, metrics, rubric, penalties, test_suite)

    prompt = _build_insights_prompt(
        user_prompts, total_score, rubric, sub_criteria,
        metrics, penalties, test_suite,
    )

    try:
        response = await generate_with_fallback(
            client,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config=types.GenerateContentConfig(
                system_instruction=_INSIGHTS_SYSTEM_PROMPT,
                max_output_tokens=1024,
                temperature=0.4,
                response_mime_type="application/json",
            ),
        )

        if response is None:
            logger.warning("Insights: all models rate-limited, using fallback")
            return _fallback_insights(user_prompts, total_score, metrics, rubric, penalties, test_suite)

        raw_insights = _parse_insights_response(response.text)
        if raw_insights is None:
            logger.warning("Insights: could not parse JSON from response")
            return _fallback_insights(user_prompts, total_score, metrics, rubric, penalties, test_suite)

        insights = []
        for raw in raw_insights:
            validated = _validate_insight(raw, num_prompts=len(user_prompts))
            if validated:
                insights.append(validated)

        if len(insights) < 2:
            logger.warning("Insights: Gemini returned fewer than 2 valid insights, using fallback")
            return _fallback_insights(user_prompts, total_score, metrics, rubric, penalties, test_suite)

        return insights[:6]

    except Exception as exc:
        logger.warning("Insights generation failed — using fallback: %s", exc)
        return _fallback_insights(user_prompts, total_score, metrics, rubric, penalties, test_suite)
