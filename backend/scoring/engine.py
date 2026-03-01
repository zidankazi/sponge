"""
Scoring engine — implements the Meta-style deterministic rubric (rubric.md).

Rubric categories (each 0–25, total 0–100 before penalties):
  A. Problem Solving   — planning, decomposition, edge-case awareness
  B. Code Quality      — AI output ownership, modification, code hygiene
  C. Verification      — test runs, coverage, debug discipline
  D. Communication     — prompt quality, grounding, iterative dialogue

Penalties (subtracted after A–D):
  P1. Over-reliance on AI   (0, -5, -10, or -15)
  P2. No-run               (-10 if zero test_run events)
  P3. Critical miss        (not auto-detectable — skipped)

The 5 frontend breakdown fields map to rubric categories:
  request_timing        ← A (Problem Solving)   scaled 0–10 from 0–25
  request_quality       ← D (Communication)     scaled 0–10 from 0–25
  response_handling     ← B (Code Quality)      scaled 0–10 from 0–25
  verification_discipline ← C (Verification)    scaled 0–10 from 0–25
  iterative_collaboration ← A+D composite       scaled 0–10
  penalties             ← P1 + P2               0 to -10

total_score = clamp(round((positives + penalties) / 50 * 100), 0, 100)
"""

import re
from typing import Optional
from models.score import HeadlineMetrics, Score, ScoreBreakdown
from models.session import Session


# ---------- RQ-specific vocabulary for grounded prompt detection ----------

RQ_TERMS = {
    # file names
    "worker.py", "queue.py", "job.py", "registry.py", "timeouts.py",
    "connections.py", "exceptions.py", "utils.py", "serializers.py",
    # class / function names
    "enqueue", "dequeue", "blpop", "hset", "lpush", "rpush",
    "enqueue_in", "enqueue_at", "dequeue_timeout",
    "baseworker", "simpleworker", "worker",
    "baseregistry", "startedregistry", "finishedregistry",
    "failedregistry", "deferredregistry", "scheduledregistry",
    "job.create", "job.fetch", "job.restore",
    # concepts
    "sorted set", "ttl", "heartbeat", "work horse", "workhorse",
    "register_birth", "register_death", "clean_registries",
    "dequeue_job_and_maintain_ttl", "execute_job",
}

TRADEOFF_TERMS = {
    "tradeoff", "trade-off", "instead of", "alternatively", "however",
    "downside", "upside", "pros", "cons", "better", "worse",
    "simpler", "more complex", "overhead", "performance", "memory",
    "time complexity", "space complexity", "o(", "big o",
}

EDGE_CASE_TERMS = {
    "edge case", "edge-case", "boundary", "corner case", "corner-case",
    "empty", "none", "null", "zero", "negative", "overflow",
    "fail", "error", "exception", "invalid", "missing",
    "timeout", "retry", "duplicate",
}


# ---------- Session data helpers ----------

def _user_prompts(session: Session) -> list[str]:
    return [t["content"] for t in session.conversation_history if t.get("role") == "user"]


def _ai_responses(session: Session) -> list[str]:
    return [t["content"] for t in session.conversation_history if t.get("role") == "assistant"]


def _events_of(session: Session, kind: str):
    return [e for e in session.events if e.event == kind]


def _session_start_ms(session: Session) -> int:
    return int(session.started_at.timestamp() * 1000)


def _is_grounded(prompt: str) -> bool:
    lower = prompt.lower()
    return any(term in lower for term in RQ_TERMS)


def _has_tradeoff_language(prompt: str) -> bool:
    lower = prompt.lower()
    return any(term in lower for term in TRADEOFF_TERMS)


def _has_edge_case_language(prompt: str) -> bool:
    lower = prompt.lower()
    return any(term in lower for term in EDGE_CASE_TERMS)


def _word_overlap(a: str, b: str) -> float:
    """Jaccard similarity between word sets of two strings."""
    wa = set(re.findall(r"\w+", a.lower()))
    wb = set(re.findall(r"\w+", b.lower()))
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


# ---------- Headline metric helpers (0.0 – 1.0 each) ----------

def _compute_headline_metrics(session: Session) -> HeadlineMetrics:
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
        Fraction of follow-up prompts (index ≥ 1) that quote or closely echo
        something from the preceding AI response (word overlap > 0.15).
    """
    prompts = _user_prompts(session)
    responses = _ai_responses(session)
    prompt_events = _events_of(session, "prompt_sent")
    edit_events = _events_of(session, "file_edit")
    test_events = _events_of(session, "test_run")

    n_turns = min(len(prompts), len(responses))

    # ── blind adoption / modification rates ─────────────────────────────
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

    # ── passive reprompt rate ────────────────────────────────────────────
    if len(prompts) < 2:
        passive_rate = 0.0
    else:
        similar_pairs = sum(
            1 for a, b in zip(prompts, prompts[1:])
            if _word_overlap(a, b) > 0.6
        )
        passive_rate = round(similar_pairs / (len(prompts) - 1), 2)

    # ── grounded prompt rate ─────────────────────────────────────────────
    if not prompts:
        grounded_rate = 0.0
    else:
        grounded_rate = round(sum(1 for p in prompts if _is_grounded(p)) / len(prompts), 2)

    # ── evidence-grounded followup rate ─────────────────────────────────
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


# ---------- Rubric category scorers (each returns 0–10) ----------

def _score_request_timing(session: Session) -> int:
    """
    Rubric A — Problem Solving (scaled 0–25 → 0–10).

    Observable signals:
      A1  first user message ≥ 30 words → shows problem restatement
      A2  ≥ 2 files opened before first prompt → shows exploration/planning
      A2  time to first prompt 2–20 min → appropriate planning window
      A4  edge-case keywords in any prompt → awareness before coding
    """
    prompts = _user_prompts(session)
    prompt_events = _events_of(session, "prompt_sent")
    file_open_events = _events_of(session, "file_open")
    start_ms = _session_start_ms(session)

    score = 0

    # A1 — problem restatement proxy: first prompt has substance
    if prompts:
        first_words = len(prompts[0].split())
        if first_words >= 50:
            score += 3
        elif first_words >= 20:
            score += 2
        elif first_words >= 8:
            score += 1

    # A2 — exploration before first prompt
    if prompt_events:
        first_prompt_ts = prompt_events[0].ts
        files_before = sum(1 for e in file_open_events if e.ts < first_prompt_ts)
        if files_before >= 3:
            score += 3
        elif files_before >= 1:
            score += 2

        # A2 — timing: asked AI after thinking, not immediately
        minutes_to_first = (first_prompt_ts - start_ms) / 60_000
        if 2 <= minutes_to_first <= 20:
            score += 2
        elif minutes_to_first > 0:
            score += 1
    else:
        # Never asked AI — no collaboration signal
        score += 0

    # A4 — edge-case awareness anywhere in prompts
    if any(_has_edge_case_language(p) for p in prompts):
        score += 2

    return min(10, score)


def _score_request_quality(session: Session) -> int:
    """
    Rubric D — Communication (scaled 0–25 → 0–10).

    Observable signals:
      D1  average prompt length ≥ 30 words → narrating intent
      D2  tradeoff/decision language in prompts → explains reasoning
      D3  grounded prompts (file/function names) → uses AI tactically
      D4  ≥ 3 conversation turns → regular status/next-step cadence
    """
    prompts = _user_prompts(session)
    if not prompts:
        return 0

    score = 0

    # D1 — prompt substance (narration proxy)
    avg_len = sum(len(p.split()) for p in prompts) / len(prompts)
    if avg_len >= 50:
        score += 3
    elif avg_len >= 25:
        score += 2
    elif avg_len >= 10:
        score += 1

    # D2 — tradeoff language
    tradeoff_count = sum(1 for p in prompts if _has_tradeoff_language(p))
    if tradeoff_count >= 2:
        score += 3
    elif tradeoff_count == 1:
        score += 2

    # D3 — grounded prompts (AI used tactically, not blindly)
    grounded_count = sum(1 for p in prompts if _is_grounded(p))
    grounded_frac = grounded_count / len(prompts)
    if grounded_frac >= 0.6:
        score += 2
    elif grounded_frac >= 0.3:
        score += 1

    # D4 — dialogue depth (≥ 3 turns signals ongoing collaboration)
    if len(prompts) >= 5:
        score += 2
    elif len(prompts) >= 3:
        score += 1

    return min(10, score)


def _score_response_handling(session: Session) -> int:
    """
    Rubric B — Code Quality, specifically B4 (AI code ownership).

    Observable signals:
      B4  ai_modification_rate ≥ 0.6 → edited most AI responses
      B4  evidence_grounded_followup_rate → referenced AI content in follow-ups
          (shows they read and reasoned about the response, not blind copy-paste)
      B4  at least one file_edit after each AI response in general
    """
    prompts = _user_prompts(session)
    responses = _ai_responses(session)
    prompt_events = _events_of(session, "prompt_sent")
    edit_events = _events_of(session, "file_edit")

    if not prompt_events:
        return 0

    score = 0

    # Count edits that follow each prompt window
    mod_count = 0
    for i, p_event in enumerate(prompt_events):
        window_start = p_event.ts
        window_end = prompt_events[i + 1].ts if i + 1 < len(prompt_events) else float("inf")
        if any(window_start < e.ts < window_end for e in edit_events):
            mod_count += 1

    mod_rate = mod_count / len(prompt_events)

    if mod_rate >= 0.75:
        score += 5
    elif mod_rate >= 0.5:
        score += 4
    elif mod_rate >= 0.25:
        score += 2
    else:
        score += 0  # blind adoption

    # Evidence-grounded follow-ups (B4 proxy: explains/references AI output)
    if len(prompts) >= 2 and responses:
        followups = prompts[1:]
        preceding = responses[:len(followups)]
        evidence_count = sum(
            1 for p, r in zip(followups, preceding)
            if _word_overlap(p, r) > 0.15
        )
        evidence_frac = evidence_count / len(followups)
        if evidence_frac >= 0.5:
            score += 3
        elif evidence_frac >= 0.25:
            score += 2
        elif evidence_frac > 0:
            score += 1

    # Total file edits as a rough quality signal (more edits = more ownership)
    total_edits = len(edit_events)
    if total_edits >= 5:
        score += 2
    elif total_edits >= 2:
        score += 1

    return min(10, score)


def _score_verification_discipline(session: Session) -> int:
    """
    Rubric C — Verification (C1 execution frequency, C3 validation of AI output,
    C4 debug discipline).

    Observable signals:
      C1  number of test_run events → execution frequency
      C3  test_run events that follow a prompt_sent → validated AI output
      C4  test → edit → test patterns → debug discipline
    """
    test_events = _events_of(session, "test_run")
    prompt_events = _events_of(session, "prompt_sent")
    edit_events = _events_of(session, "file_edit")

    score = 0

    # C1 — execution frequency
    n_tests = len(test_events)
    if n_tests >= 4:
        score += 4      # iterative runs
    elif n_tests >= 2:
        score += 3      # after milestones
    elif n_tests == 1:
        score += 1      # ran once near end
    # else 0: never ran

    # C3 — validated AI output (test_run within each prompt's window, not just "any later test")
    if prompt_events and test_events:
        tests_after_ai = 0
        for i, p_event in enumerate(prompt_events):
            window_start = p_event.ts
            window_end = prompt_events[i + 1].ts if i + 1 < len(prompt_events) else float("inf")
            if any(window_start < t.ts < window_end for t in test_events):
                tests_after_ai += 1
        if tests_after_ai >= 2:
            score += 3
        elif tests_after_ai == 1:
            score += 2

    # C4 — debug discipline: test → edit → test pattern
    all_events = sorted(session.events, key=lambda e: e.ts)
    debug_cycles = 0
    for i, ev in enumerate(all_events):
        if ev.event == "test_run":
            # look for edit then another test_run
            subsequent = all_events[i + 1:]
            has_edit = any(e.event == "file_edit" for e in subsequent)
            has_retest = any(e.event == "test_run" for e in subsequent)
            if has_edit and has_retest:
                debug_cycles += 1
                break  # one confirmed cycle is enough to award points

    if debug_cycles:
        score += 3

    return min(10, score)


def _score_iterative_collaboration(session: Session) -> int:
    """
    Composite of A3 (approach justification through dialogue) and D3/D4
    (AI collaboration balance, checkpoints).

    Observable signals:
      number of conversation turns
      low passive_reprompt_rate (asks new questions vs repeating)
      grounded follow-ups (references codebase in later turns)
    """
    prompts = _user_prompts(session)
    n = len(prompts)

    if n == 0:
        return 0

    score = 0

    # Dialogue depth
    if n >= 7:
        score += 4
    elif n >= 4:
        score += 3
    elif n >= 2:
        score += 2
    else:
        score += 1

    # Low passive reprompt = productive dialogue
    if n >= 2:
        similar_pairs = sum(
            1 for a, b in zip(prompts, prompts[1:])
            if _word_overlap(a, b) > 0.6
        )
        passive_rate = similar_pairs / (n - 1)
        if passive_rate <= 0.1:
            score += 3
        elif passive_rate <= 0.3:
            score += 2
        elif passive_rate <= 0.5:
            score += 1

    # Grounded later prompts (D3: uses AI tactically in ongoing work)
    later_prompts = prompts[1:] if len(prompts) > 1 else []
    if later_prompts:
        late_grounded = sum(1 for p in later_prompts if _is_grounded(p))
        if late_grounded / len(later_prompts) >= 0.5:
            score += 3
        elif late_grounded / len(later_prompts) >= 0.25:
            score += 2
        elif late_grounded > 0:
            score += 1

    return min(10, score)


def _score_penalties(session: Session, metrics: HeadlineMetrics) -> int:
    """
    Rubric penalties P1 and P2, capped at -10 to fit the breakdown field.

    The engine works on a 0-50 raw scale that maps to 0-100 via (raw/50)*100,
    so rubric penalty values are halved:

    P1 (over-reliance on AI) — rubric: 0 / -5 / -10 / -15 on 0-100:
      -3  if blind_adoption_rate > 0.4  (copies without review regularly)     → ~-6 on 0-100
      -5  if blind_adoption_rate > 0.6  (AI decides core algorithm)           → -10 on 0-100
      -8  if blind_adoption_rate > 0.8  (accepts with minimal understanding)  → -16 on 0-100

    P2 (no-run) — rubric: -10 on 0-100:
      -5  if zero test_run events  → -10 on 0-100
    """
    penalty = 0
    test_events = _events_of(session, "test_run")

    # P2 — never ran tests (rubric: -10 on 0-100 → -5 on 0-50)
    if not test_events:
        penalty -= 5

    # P1 — over-reliance on AI (rubric: -5/-10/-15 on 0-100)
    if metrics.blind_adoption_rate > 0.8:
        penalty -= 8    # worst tier: accepts AI with minimal understanding
    elif metrics.blind_adoption_rate > 0.6:
        penalty -= 5    # mid tier: AI decides core algorithm without justification
    elif metrics.blind_adoption_rate > 0.4:
        penalty -= 3    # mild tier: repeatedly copies without review

    return max(-10, penalty)


# ---------- Badge thresholds ----------

def _assign_badge(total: int) -> str:
    """total is on the 0–100 scale. Tiers must match Badge.jsx exactly."""
    if total >= 85:
        return "AI Collaborator"
    if total >= 70:
        return "On Your Way"
    if total >= 50:
        return "Needs Work"
    return "Just Vibing"


# ---------- Interpretation builder ----------

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


def _has_any_tests_signal(breakdown: ScoreBreakdown) -> bool:
    """Heuristic: if verification_discipline > 0 then tests were run."""
    return breakdown.verification_discipline > 0


# ---------- Public entry point ----------

def compute_score(session: Session, semantic_eval: "Optional[object]" = None) -> Score:
    """
    Compute and return a Score for the given session.
    Called by POST /submit after final_code is set on the session.

    If semantic_eval (SemanticEval) is provided, its scores are blended with
    metric-based scores for request_quality and response_handling (60/40 in
    favour of semantic), and its interpretation replaces the template text.
    Falls back to pure metrics if semantic_eval is None.
    """
    # Compute headline metrics first — penalties depend on them
    metrics = _compute_headline_metrics(session)

    # Base metric scores for the two content-sensitive dimensions
    metric_rq = _score_request_quality(session)
    metric_rh = _score_response_handling(session)

    # Blend: 60% semantic + 40% metric when semantic eval is available.
    # Metrics still anchor the score so it can't be gamed by empty-but-long prompts.
    if semantic_eval is not None:
        request_quality = min(10, round(0.4 * metric_rq + 0.6 * semantic_eval.prompt_quality_score))
        response_handling = min(10, round(0.4 * metric_rh + 0.6 * semantic_eval.response_engagement_score))
    else:
        request_quality = metric_rq
        response_handling = metric_rh

    breakdown = ScoreBreakdown(
        request_timing=_score_request_timing(session),
        request_quality=request_quality,
        response_handling=response_handling,
        verification_discipline=_score_verification_discipline(session),
        iterative_collaboration=_score_iterative_collaboration(session),
        penalties=_score_penalties(session, metrics),
    )

    positives = (
        breakdown.request_timing
        + breakdown.request_quality
        + breakdown.response_handling
        + breakdown.verification_discipline
        + breakdown.iterative_collaboration
    )
    # Scale to 0–100 to match frontend grade thresholds
    total = max(0, min(100, round((positives + breakdown.penalties) / 50 * 100)))

    badge = _assign_badge(total)

    # Use Gemini's personalized interpretation if available, else template
    if semantic_eval is not None:
        interpretation = semantic_eval.interpretation
    else:
        interpretation = _build_interpretation(total, breakdown, metrics)

    return Score(
        total_score=total,
        breakdown=breakdown,
        headline_metrics=metrics,
        interpretation=interpretation,
        badge=badge,
    )
