"""
Template-based interpretation builder for scoring results.

Extracted from engine.py — generates human-readable interpretation text
from the rubric categories and headline metrics.
"""

from models.score import HeadlineMetrics, ScoreBreakdown


def _has_any_tests_signal(breakdown: ScoreBreakdown) -> bool:
    """Heuristic: if verification_discipline > 0 then tests were run."""
    return breakdown.verification_discipline > 0


def _build_interpretation(total: int, breakdown: ScoreBreakdown, metrics: HeadlineMetrics) -> str:
    """
    Template-based interpretation from the rubric categories and headline metrics.
    One sentence per dimension, assembled into a paragraph.
    """
    parts = []

    # Problem Solving / timing
    if breakdown.request_timing >= 8:
        parts.append("You explored the codebase before reaching for AI and framed your questions with clear constraints — strong problem-solving instincts.")
    elif breakdown.request_timing >= 5:
        parts.append("You showed reasonable planning before using AI, though earlier codebase exploration would have made your prompts sharper.")
    else:
        parts.append("Try exploring relevant files before your first AI prompt — it leads to more targeted questions and better answers.")

    # Communication / request quality
    if breakdown.request_quality >= 8:
        parts.append("Your prompts were specific, technically grounded, and showed ownership of the reasoning.")
    elif breakdown.request_quality >= 5:
        parts.append("Your prompts were decent but could be more grounded — referencing specific files and explaining tradeoffs helps AI give better answers.")
    else:
        parts.append("Work on prompt quality: name the files and functions you're asking about, and explain what you've already tried.")

    # Code Quality / response handling
    if breakdown.response_handling >= 8:
        parts.append("You reviewed and modified AI suggestions before applying them — excellent ownership of AI-generated code.")
    elif breakdown.response_handling >= 5:
        parts.append("You modified some AI output, but there were instances of blind adoption. Make it a habit to edit every suggestion.")
    else:
        parts.append("Most AI suggestions were applied without modification. Reviewing and adapting code before committing it is a key collaboration skill.")

    # Verification
    if breakdown.verification_discipline >= 8:
        parts.append("Verification discipline was strong — you ran tests iteratively and used them to validate AI output.")
    elif breakdown.verification_discipline >= 5:
        parts.append("You ran some tests, but running them more frequently — especially right after each AI suggestion — would improve your score.")
    else:
        parts.append("Testing was minimal. The Meta rubric rewards running tests after every meaningful change, particularly after accepting AI output.")

    # Iterative collaboration
    if breakdown.iterative_collaboration >= 8:
        parts.append("Your multi-turn dialogue with AI was productive — you built on responses rather than re-asking the same questions.")
    elif breakdown.iterative_collaboration >= 5:
        parts.append("The dialogue was reasonable. Aim for more back-and-forth where each follow-up builds on what the AI said.")
    else:
        parts.append("Lean more into iterative AI dialogue — ask for clarification, challenge suggestions, and refine your approach across turns.")

    # Penalties note
    if metrics.blind_adoption_rate > 0.4:
        parts.append(f"Penalty applied: {round(metrics.blind_adoption_rate * 100)}% of AI responses were applied without any code edits.")
    if not _has_any_tests_signal(breakdown):
        parts.append("Penalty applied: no test runs were detected during the session.")

    return " ".join(parts)
