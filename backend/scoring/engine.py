"""
Scoring engine.

Receives a completed Session (with all events and conversation history)
and returns a Score object.

Scoring categories (from AGENTS.md):
  - request_timing           (0–10)  Did they ask AI early enough?
  - request_quality          (0–10)  Were prompts specific and grounded?
  - response_handling        (0–10)  Did they critically evaluate AI output?
  - verification_discipline  (0–10)  Did they run tests after AI suggestions?
  - iterative_collaboration  (0–10)  Did they refine through dialogue?
  - penalties                (0 to -10)  Blind copy-paste, passive re-prompting, etc.

Total max: 50 points (penalties can reduce it).

TODO: Replace placeholder logic with real metric computation.
"""

from models.score import HeadlineMetrics, Score, ScoreBreakdown
from models.session import Session


# ---------- Badge thresholds ----------

def _assign_badge(total: int) -> str:
    if total >= 45:
        return "AI Collaborator"
    if total >= 35:
        return "On Your Way"
    if total >= 20:
        return "Getting Started"
    return "Solo Coder"


# ---------- Placeholder metric helpers ----------
# Each returns a value in the expected range.
# Replace these with real computation once the scoring logic is designed.

def _compute_request_timing(session: Session) -> int:
    """
    Placeholder: did the user send their first prompt early?
    Real logic: compare ts of first prompt_sent event to session start time.
    """
    # TODO: implement real timing logic
    return 5


def _compute_request_quality(session: Session) -> int:
    """
    Placeholder: were prompts specific and grounded in the codebase?
    Real logic: analyse prompt_text fields in conversation_history for specificity signals.
    """
    # TODO: implement real quality scoring (e.g. keyword matching, length heuristics)
    return 5


def _compute_response_handling(session: Session) -> int:
    """
    Placeholder: did the user modify AI responses before using them?
    Real logic: compare AI suggestions to final_code diffs.
    """
    # TODO: implement real diff / acceptance analysis
    return 5


def _compute_verification_discipline(session: Session) -> int:
    """
    Placeholder: did the user run tests after AI suggestions?
    Real logic: look for test_run events that follow prompt_sent events.
    """
    # TODO: implement real event-sequence analysis
    return 5


def _compute_iterative_collaboration(session: Session) -> int:
    """
    Placeholder: did the user engage in multi-turn dialogue?
    Real logic: count meaningful follow-up turns in conversation_history.
    """
    # TODO: implement real turn-quality analysis
    return 5


def _compute_penalties(session: Session) -> int:
    """
    Placeholder: deduct for blind copy-paste, passive re-prompting, etc.
    Real logic: detect repeated identical prompts, zero edits after AI response, etc.
    """
    # TODO: implement real penalty detection
    return 0


def _compute_headline_metrics(session: Session) -> HeadlineMetrics:
    """
    Placeholder metrics — all set to neutral values.
    Real logic: derive from event log and conversation history analysis.
    """
    # TODO: compute each metric from session data
    return HeadlineMetrics(
        blind_adoption_rate=0.0,
        ai_modification_rate=0.0,
        test_after_ai_rate=0.0,
        passive_reprompt_rate=0.0,
        grounded_prompt_rate=0.0,
        evidence_grounded_followup_rate=0.0,
    )


def _build_interpretation(score: int, breakdown: ScoreBreakdown) -> str:
    """
    Placeholder: generate a human-readable summary of performance.
    Real logic: template-based or LLM-generated interpretation.
    """
    # TODO: implement meaningful interpretation based on breakdown
    return (
        f"You scored {score} points. "
        "The scoring engine will provide detailed feedback once implemented."
    )


# ---------- Public entry point ----------

def compute_score(session: Session) -> Score:
    """
    Compute and return a Score for the given session.
    Called by POST /submit after final_code is set on the session.
    """
    breakdown = ScoreBreakdown(
        request_timing=_compute_request_timing(session),
        request_quality=_compute_request_quality(session),
        response_handling=_compute_response_handling(session),
        verification_discipline=_compute_verification_discipline(session),
        iterative_collaboration=_compute_iterative_collaboration(session),
        penalties=_compute_penalties(session),
    )

    total = (
        breakdown.request_timing
        + breakdown.request_quality
        + breakdown.response_handling
        + breakdown.verification_discipline
        + breakdown.iterative_collaboration
        + breakdown.penalties
    )

    metrics = _compute_headline_metrics(session)
    badge = _assign_badge(total)
    interpretation = _build_interpretation(total, breakdown)

    return Score(
        total_score=total,
        breakdown=breakdown,
        headline_metrics=metrics,
        interpretation=interpretation,
        badge=badge,
    )
