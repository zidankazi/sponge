"""
Headline metric computation and session data helpers.

Extracted from engine.py — computes the 6 headline metrics (0.0–1.0 each)
from the event log and conversation history.
"""

from models.score import HeadlineMetrics
from models.session import Session
from scoring.vocabulary import _is_grounded, _word_overlap


# ---------- Session data helpers ----------

def _user_prompts(session: Session) -> list[str]:
    return [t["content"] for t in session.conversation_history if t.get("role") == "user"]


def _ai_responses(session: Session) -> list[str]:
    return [t["content"] for t in session.conversation_history if t.get("role") == "assistant"]


def _events_of(session: Session, kind: str):
    return [e for e in session.events if e.event == kind]


def _session_start_ms(session: Session) -> int:
    return int(session.started_at.timestamp() * 1000)


# ---------- Headline metric computation (0.0 – 1.0 each) ----------

def compute_headline_metrics(session: Session) -> HeadlineMetrics:
    """
    All metrics derived purely from the event log and conversation history.

    blind_adoption_rate:
        Fraction of AI responses NOT followed by any file_edit before the
        next prompt (or submit). High = bad (user copied without reviewing).

    ai_modification_rate:
        Fraction of AI responses followed by at least one file_edit.

    test_after_ai_rate:
        Fraction of AI responses followed by a test_run before the next prompt.

    passive_reprompt_rate:
        Fraction of consecutive user prompt pairs with Jaccard similarity > 0.6.
        Signals re-asking the same question without new info.

    grounded_prompt_rate:
        Fraction of user prompts that mention at least one RQ file or function.

    evidence_grounded_followup_rate:
        Fraction of follow-up prompts (index >= 1) that quote or closely echo
        something from the preceding AI response (word overlap > 0.15).
    """
    prompts = _user_prompts(session)
    responses = _ai_responses(session)
    prompt_events = _events_of(session, "prompt_sent")
    edit_events = _events_of(session, "file_edit")
    test_events = _events_of(session, "test_run")

    n_turns = min(len(prompts), len(responses))

    # -- blind adoption / modification rates --
    if n_turns == 0:
        blind_rate = 0.0
        mod_rate = 0.0
        test_after_rate = 0.0
    else:
        blind_count = 0
        mod_count = 0
        test_after_count = 0

        for i, p_event in enumerate(prompt_events):
            # window: from this prompt_sent to the next prompt_sent (or end)
            window_start = p_event.ts
            window_end = prompt_events[i + 1].ts if i + 1 < len(prompt_events) else float("inf")

            edits_in_window = [e for e in edit_events if window_start < e.ts < window_end]
            tests_in_window = [e for e in test_events if window_start < e.ts < window_end]

            if edits_in_window:
                mod_count += 1
            else:
                blind_count += 1

            if tests_in_window:
                test_after_count += 1

        n = len(prompt_events) or 1
        blind_rate = round(blind_count / n, 2)
        mod_rate = round(mod_count / n, 2)
        test_after_rate = round(test_after_count / n, 2)

    # -- passive reprompt rate --
    if len(prompts) < 2:
        passive_rate = 0.0
    else:
        similar_pairs = sum(
            1 for a, b in zip(prompts, prompts[1:])
            if _word_overlap(a, b) > 0.6
        )
        passive_rate = round(similar_pairs / (len(prompts) - 1), 2)

    # -- grounded prompt rate --
    if not prompts:
        grounded_rate = 0.0
    else:
        grounded_rate = round(sum(1 for p in prompts if _is_grounded(p)) / len(prompts), 2)

    # -- evidence-grounded followup rate --
    if len(prompts) < 2 or len(responses) < 1:
        evidence_rate = 0.0
    else:
        followups = prompts[1:]
        preceding_responses = responses[:len(followups)]
        evidence_count = sum(
            1 for p, r in zip(followups, preceding_responses)
            if _word_overlap(p, r) > 0.15
        )
        evidence_rate = round(evidence_count / len(followups), 2)

    return HeadlineMetrics(
        blind_adoption_rate=blind_rate,
        ai_modification_rate=mod_rate,
        test_after_ai_rate=test_after_rate,
        passive_reprompt_rate=passive_rate,
        grounded_prompt_rate=grounded_rate,
        evidence_grounded_followup_rate=evidence_rate,
    )
