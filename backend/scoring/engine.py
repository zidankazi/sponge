"""
Scoring engine v2 — implements the Meta-style rubric on native 0-25 per category.

Rubric categories (each 0-25, total 0-100 before penalties):
  A. Problem Solving   (A1 understanding, A2 decomposition, A3 justification, A4 edge cases)
  B. Code Quality      (B1 clarity, B2 correctness, B3 efficiency, B4 ownership)
  C. Verification      (C1 exec frequency, C2 test coverage, C3 AI validation, C4 debug discipline)
  D. Communication     (D1 narration, D2 tradeoffs, D3 AI balance, D4 status summaries)

Penalties (subtracted after A-D on the 0-100 scale):
  P1. Over-reliance on AI   (0, -5, -10, or -15)
  P2. No-run               (-10 if zero test_run events)
  P3. Critical miss         (0 for now, enabled via test runner later)

total_score = clamp(A + B + C + D + P1 + P2 + P3, 0, 100)

The 5 frontend breakdown fields (0-10 each) are derived for backward compatibility:
  request_timing         = round(A / 25 * 10)
  request_quality        = round(D / 25 * 10)
  response_handling      = round(B / 25 * 10)
  verification_discipline = round(C / 25 * 10)
  iterative_collaboration = round((A + D) / 50 * 10)
  penalties              = max(P1 + P2 + P3, -10) scaled
"""

from typing import Optional
from models.score import (
    HeadlineMetrics, Score, ScoreBreakdown,
    RubricBreakdown, SubCriteriaDetail, PenaltyDetail,
)
from models.session import Session
from scoring.vocabulary import (
    _is_grounded, _has_tradeoff_language, _has_edge_case_language, _word_overlap,
)
from scoring.metrics import (
    compute_headline_metrics,
    _user_prompts, _ai_responses, _events_of, _session_start_ms,
)
from scoring.interpretation import _build_interpretation


# ---------- Category A: Problem Solving (0-25) ----------

def _score_problem_solving(session: Session) -> dict:
    """
    Returns dict with a1, a2, a3, a4 sub-criteria scores.
    A1: Understanding & Restatement (0-6)
    A2: Decomposition / Plan (0-7)
    A3: Algorithm/Approach Justification (0-7) — pure semantic, metric fallback
    A4: Edge Cases Before Coding (0-5)
    """
    prompts = _user_prompts(session)
    prompt_events = _events_of(session, "prompt_sent")
    file_open_events = _events_of(session, "file_open")
    start_ms = _session_start_ms(session)

    # A1 — Problem Understanding (0-6)
    # Metric: first prompt word count as proxy for problem restatement
    a1 = 0.0
    if prompts:
        first_words = len(prompts[0].split())
        if first_words >= 50:
            a1 = 4.0
        elif first_words >= 20:
            a1 = 3.0
        elif first_words >= 8:
            a1 = 2.0

    # A2 — Decomposition / Plan (0-7)
    # Metric: files explored + time to first prompt
    a2 = 0.0
    if prompt_events:
        first_prompt_ts = prompt_events[0].ts
        files_before = sum(1 for e in file_open_events if e.ts < first_prompt_ts)
        if files_before >= 3:
            a2 += 3.0
        elif files_before >= 1:
            a2 += 2.0

        minutes_to_first = (first_prompt_ts - start_ms) / 60_000
        if 2 <= minutes_to_first <= 20:
            a2 += 2.0
        elif minutes_to_first > 0:
            a2 += 1.0

    # A3 — Justification (0-7) — pure semantic
    # Metric fallback: dialogue depth as proxy for approach discussion
    a3 = 0.0
    n_prompts = len(prompts)
    if n_prompts >= 7:
        a3 = 3.0
    elif n_prompts >= 4:
        a3 = 2.0
    elif n_prompts >= 2:
        a3 = 1.0

    # A4 — Edge Cases (0-5)
    # Metric: count prompts mentioning edge case terms
    edge_count = sum(1 for p in prompts if _has_edge_case_language(p))
    if edge_count >= 4:
        a4 = 3.0
    elif edge_count >= 2:
        a4 = 2.0
    elif edge_count >= 1:
        a4 = 1.0
    else:
        a4 = 0.0

    return {"a1": min(a1, 6), "a2": min(a2, 7), "a3": min(a3, 7), "a4": min(a4, 5)}


# ---------- Category B: Code Quality (0-25) ----------

def _score_code_quality(session: Session) -> dict:
    """
    Returns dict with b1, b2, b3, b4 sub-criteria scores.
    B1: Clarity/Readability (0-8) — pure semantic (code analysis), default 4
    B2: Correctness (0-7) — execution-gated semantic, default 3.5
    B3: Efficiency (0-5) — blended, default 2.5
    B4: AI Code Ownership (0-5) — metric primary
    """
    prompts = _user_prompts(session)
    responses = _ai_responses(session)
    prompt_events = _events_of(session, "prompt_sent")
    edit_events = _events_of(session, "file_edit")

    # B1, B2, B3 — defaults until code analysis is wired (SE-009/011)
    b1 = 4.0   # mid-range default for clarity
    b2 = 3.5   # mid-range default for correctness
    b3 = 2.5   # mid-range default for efficiency

    # B4 — AI Code Ownership (0-5)
    # Metric: modification rate + edit count
    b4 = 0.0
    if prompt_events:
        mod_count = 0
        for i, p_event in enumerate(prompt_events):
            window_start = p_event.ts
            window_end = prompt_events[i + 1].ts if i + 1 < len(prompt_events) else float("inf")
            if any(window_start < e.ts < window_end for e in edit_events):
                mod_count += 1

        mod_rate = mod_count / len(prompt_events)
        if mod_rate >= 0.75:
            b4 = 3.0
        elif mod_rate >= 0.5:
            b4 = 2.0
        elif mod_rate >= 0.25:
            b4 = 1.0

        # Evidence-grounded follow-ups as ownership signal
        if len(prompts) >= 2 and responses:
            followups = prompts[1:]
            preceding = responses[:len(followups)]
            evidence_count = sum(
                1 for p, r in zip(followups, preceding)
                if _word_overlap(p, r) > 0.15
            )
            evidence_frac = evidence_count / len(followups)
            if evidence_frac >= 0.5:
                b4 += 1.5
            elif evidence_frac >= 0.25:
                b4 += 1.0
            elif evidence_frac > 0:
                b4 += 0.5

    return {"b1": min(b1, 8), "b2": min(b2, 7), "b3": min(b3, 5), "b4": min(b4, 5)}


# ---------- Category C: Verification (0-25) ----------

def _score_verification(session: Session) -> dict:
    """
    Returns dict with c1, c2, c3, c4 sub-criteria scores.
    C1: Execution Frequency (0-8) — pure metric
    C2: Test Coverage (0-9) — semantic + metric floor
    C3: AI Output Validation (0-4) — blended
    C4: Debug Discipline (0-4) — pure metric
    """
    test_events = _events_of(session, "test_run")
    prompt_events = _events_of(session, "prompt_sent")

    n_tests = len(test_events)

    # C1 — Execution Frequency (0-8)
    if n_tests >= 4:
        c1 = 8.0
    elif n_tests >= 2:
        c1 = 6.0
    elif n_tests == 1:
        c1 = 3.0
    else:
        c1 = 0.0

    # C2 — Test Coverage (0-9)
    # Metric floor: test_run count >= 1 → 3
    if n_tests >= 1:
        c2 = 3.0
    else:
        c2 = 0.0

    # C3 — AI Output Validation (0-4)
    # Metric: test_after_ai_rate
    c3 = 0.0
    if prompt_events and test_events:
        tests_after_ai = 0
        for i, p_event in enumerate(prompt_events):
            window_start = p_event.ts
            window_end = prompt_events[i + 1].ts if i + 1 < len(prompt_events) else float("inf")
            if any(window_start < t.ts < window_end for t in test_events):
                tests_after_ai += 1
        rate = tests_after_ai / len(prompt_events) if prompt_events else 0
        if rate >= 0.5:
            c3 = 2.0
        elif rate >= 0.25:
            c3 = 1.0

    # C4 — Debug Discipline (0-4)
    # Metric: test → edit → test pattern
    all_events = sorted(session.events, key=lambda e: e.ts)
    c4 = 0.0
    for i, ev in enumerate(all_events):
        if ev.event == "test_run":
            subsequent = all_events[i + 1:]
            has_edit = any(e.event == "file_edit" for e in subsequent)
            has_retest = any(e.event == "test_run" for e in subsequent)
            if has_edit and has_retest:
                c4 = 4.0
                break
            elif has_edit:
                c4 = 2.0
                break

    return {"c1": min(c1, 8), "c2": min(c2, 9), "c3": min(c3, 4), "c4": min(c4, 4)}


# ---------- Category D: Communication (0-25) ----------

def _score_communication(session: Session) -> dict:
    """
    Returns dict with d1, d2, d3, d4 sub-criteria scores.
    D1: Continuous Narration (0-8) — semantic + metric floor
    D2: Tradeoffs and Decisions (0-7) — pure semantic, metric fallback
    D3: AI Collaboration Balance (0-5) — blended
    D4: Status Summaries (0-5) — pure semantic, metric fallback
    """
    prompts = _user_prompts(session)
    if not prompts:
        return {"d1": 0.0, "d2": 0.0, "d3": 0.0, "d4": 0.0}

    n = len(prompts)

    # D1 — Narration (0-8)
    # Metric floor: avg prompt length
    avg_len = sum(len(p.split()) for p in prompts) / n
    if avg_len >= 50:
        d1 = 3.0
    elif avg_len >= 25:
        d1 = 2.0
    elif avg_len >= 10:
        d1 = 1.0
    else:
        d1 = 0.0

    # D2 — Tradeoffs (0-7) — pure semantic
    # Metric fallback: tradeoff keyword count (capped conservatively)
    tradeoff_count = sum(1 for p in prompts if _has_tradeoff_language(p))
    if tradeoff_count >= 3:
        d2 = 3.0
    elif tradeoff_count >= 2:
        d2 = 2.0
    elif tradeoff_count >= 1:
        d2 = 1.0
    else:
        d2 = 0.0

    # D3 — AI Collaboration Balance (0-5)
    # Metric: grounded_prompt_rate + passive_reprompt_rate
    d3 = 0.0
    grounded_count = sum(1 for p in prompts if _is_grounded(p))
    grounded_frac = grounded_count / n
    if grounded_frac >= 0.6:
        d3 += 2.0
    elif grounded_frac >= 0.3:
        d3 += 1.0

    if n >= 2:
        similar_pairs = sum(
            1 for a, b in zip(prompts, prompts[1:])
            if _word_overlap(a, b) > 0.6
        )
        passive_rate = similar_pairs / (n - 1)
        if passive_rate <= 0.1:
            d3 += 2.0
        elif passive_rate <= 0.3:
            d3 += 1.0

    # D4 — Status Summaries (0-5) — pure semantic
    # Metric fallback: dialogue depth as proxy
    if n >= 5:
        d4 = 2.0
    elif n >= 3:
        d4 = 1.0
    else:
        d4 = 0.0

    return {"d1": min(d1, 8), "d2": min(d2, 7), "d3": min(d3, 5), "d4": min(d4, 5)}


# ---------- Penalties ----------

def _compute_penalties(session: Session, metrics: HeadlineMetrics) -> dict:
    """
    Returns dict with p1, p2, p3 penalty values on the 0-100 scale.
    P1: Over-reliance on AI (0, -5, -10, or -15)
    P2: No-run (-10 if zero test_run events)
    P3: Critical miss (0 for now — enabled via test runner in SE-011)
    """
    test_events = _events_of(session, "test_run")

    # P1 — Over-reliance on AI
    if metrics.blind_adoption_rate > 0.8:
        p1 = -15
    elif metrics.blind_adoption_rate > 0.6:
        p1 = -10
    elif metrics.blind_adoption_rate > 0.4:
        p1 = -5
    else:
        p1 = 0

    # P2 — No-run
    p2 = -10 if not test_events else 0

    # P3 — Critical miss (0 for now)
    p3 = 0

    return {"p1": p1, "p2": p2, "p3": p3}


# ---------- Badge thresholds ----------

def _assign_badge(total: int) -> str:
    if total >= 85:
        return "AI Collaborator"
    if total >= 70:
        return "On Your Way"
    if total >= 50:
        return "Needs Work"
    return "Just Vibing"


# ---------- Public entry point ----------

def compute_score(
    session: Session,
    semantic_eval: "Optional[object]" = None,
    conv_eval: "Optional[object]" = None,
    code_eval: "Optional[object]" = None,
    test_results: "Optional[object]" = None,
) -> Score:
    """
    Compute and return a Score for the given session.

    Parameters:
      session: The session with events and conversation_history
      semantic_eval: Legacy 2-dimension eval (prompt_quality_score, response_engagement_score)
      conv_eval: New 12-dimension conversation eval (ConversationSemanticEval) — wired in SE-011
      code_eval: Code analysis eval (CodeSemanticEval) — wired in SE-011
      test_results: Test suite results (TestSuiteResult) — wired in SE-011

    Falls back to pure metrics if all evals are None.
    """
    metrics = compute_headline_metrics(session)

    # Score each category
    a = _score_problem_solving(session)
    b = _score_code_quality(session)
    c = _score_verification(session)
    d = _score_communication(session)
    penalties = _compute_penalties(session, metrics)

    # Legacy semantic blending: adjust D and B sub-criteria
    if semantic_eval is not None:
        # Blend D1 (narration) with prompt_quality_score (0-10 → scale to 0-8)
        sem_d1 = semantic_eval.prompt_quality_score / 10 * 8
        d["d1"] = min(8, round(0.4 * d["d1"] + 0.6 * sem_d1, 1))

        # Blend B4 (ownership) with response_engagement_score (0-10 → scale to 0-5)
        sem_b4 = semantic_eval.response_engagement_score / 10 * 5
        b["b4"] = min(5, round(0.4 * b["b4"] + 0.6 * sem_b4, 1))

    # Category totals (0-25 each)
    cat_a = round(a["a1"] + a["a2"] + a["a3"] + a["a4"], 1)
    cat_b = round(b["b1"] + b["b2"] + b["b3"] + b["b4"], 1)
    cat_c = round(c["c1"] + c["c2"] + c["c3"] + c["c4"], 1)
    cat_d = round(d["d1"] + d["d2"] + d["d3"] + d["d4"], 1)

    # Clamp categories to 0-25
    cat_a = max(0, min(25, cat_a))
    cat_b = max(0, min(25, cat_b))
    cat_c = max(0, min(25, cat_c))
    cat_d = max(0, min(25, cat_d))

    # Total score on 0-100
    p_total = penalties["p1"] + penalties["p2"] + penalties["p3"]
    total = max(0, min(100, round(cat_a + cat_b + cat_c + cat_d + p_total)))

    badge = _assign_badge(total)

    # Populate sub-criteria detail
    sub_criteria = SubCriteriaDetail(
        a1_understanding=a["a1"],
        a2_decomposition=a["a2"],
        a3_justification=a["a3"],
        a4_edge_cases=a["a4"],
        b1_clarity=b["b1"],
        b2_correctness=b["b2"],
        b3_efficiency=b["b3"],
        b4_ownership=b["b4"],
        c1_exec_frequency=c["c1"],
        c2_test_coverage=c["c2"],
        c3_ai_validation=c["c3"],
        c4_debug_discipline=c["c4"],
        d1_narration=d["d1"],
        d2_tradeoffs=d["d2"],
        d3_ai_balance=d["d3"],
        d4_status_summaries=d["d4"],
    )

    rubric_breakdown = RubricBreakdown(
        problem_solving=cat_a,
        code_quality=cat_b,
        verification=cat_c,
        communication=cat_d,
    )

    penalty_detail = PenaltyDetail(
        p1_over_reliance=penalties["p1"],
        p2_no_run=penalties["p2"],
        p3_critical_miss=penalties["p3"],
    )

    # Derive 0-10 breakdown fields for backward compatibility
    breakdown = ScoreBreakdown(
        request_timing=max(0, min(10, round(cat_a / 25 * 10))),
        request_quality=max(0, min(10, round(cat_d / 25 * 10))),
        response_handling=max(0, min(10, round(cat_b / 25 * 10))),
        verification_discipline=max(0, min(10, round(cat_c / 25 * 10))),
        iterative_collaboration=max(0, min(10, round((cat_a + cat_d) / 50 * 10))),
        penalties=max(-10, min(0, round(p_total / 35 * 10))),
    )

    # Interpretation
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
        rubric_breakdown=rubric_breakdown,
        sub_criteria=sub_criteria,
        penalty_detail=penalty_detail,
    )
