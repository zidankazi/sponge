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
  P3. Critical miss         (-10 if core tests fail or semantic detects missing feature)

total_score = clamp(A + B + C + D + P1 + P2 + P3, 0, 100)

Blending formulas per sub-criterion (from plan Section 4):
  A1: clamp(0.4*metric + 0.6*semantic, floor, 6)
  A2: clamp(0.3*metric + 0.7*semantic, floor, 7)
  A3: pure semantic (metric fallback)
  A4: clamp(0.5*metric + 0.5*semantic, 0, 5)
  B1: pure semantic code analysis
  B2: min(test_pass_cap, semantic_b2) — execution-gated
  B3: round(0.4*conv_b3 + 0.6*code_b3)
  B4: clamp(0.4*metric + 0.6*semantic, 0, 5)
  C1: pure metric
  C2: clamp(0.3*metric + 0.7*semantic, floor, 9)
  C3: clamp(0.5*metric + 0.5*semantic, 0, 4)
  C4: pure metric
  D1: clamp(0.3*metric + 0.7*semantic, floor, 8)
  D2: pure semantic (metric fallback)
  D3: clamp(0.4*metric + 0.6*semantic, 0, 5)
  D4: pure semantic (metric fallback)

The 5 frontend breakdown fields (0-10 each) are derived for backward compatibility.
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


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


# ---------- B2 gate from test pass rate ----------

def _compute_b2_cap(test_results) -> int:
    """Returns the maximum B2 score allowed by test pass rate."""
    if test_results is None:
        return 7  # No gate — fallback to pure semantic
    if test_results.pass_rate >= 1.0:
        return 7  # 12/12: full range
    if test_results.pass_rate >= 0.8:
        return 5  # 10-11/12
    if test_results.pass_rate >= 0.5:
        return 3  # 6-9/12
    return 1      # 0-5/12: fundamentally broken


# ---------- Category A: Problem Solving (0-25) ----------

def _score_problem_solving(session: Session, conv_eval=None) -> dict:
    """
    A1: Understanding & Restatement (0-6) — semantic + metric floor
    A2: Decomposition / Plan (0-7) — semantic + metric floor
    A3: Algorithm/Approach Justification (0-7) — pure semantic
    A4: Edge Cases Before Coding (0-5) — blended 50/50
    """
    prompts = _user_prompts(session)
    prompt_events = _events_of(session, "prompt_sent")
    file_open_events = _events_of(session, "file_open")
    start_ms = _session_start_ms(session)

    # ── A1 — Problem Understanding (0-6) ──
    # Metric component (scaled to 0-6)
    a1_metric = 0.0
    a1_floor = 0.0
    a1_ceiling = 6.0
    if prompts:
        first_words = len(prompts[0].split())
        if first_words >= 50:
            a1_metric = 4.0
        elif first_words >= 20:
            a1_metric = 3.0
        elif first_words >= 8:
            a1_metric = 2.0
        # Floor: first_prompt_words >= 20 AND mentions RQ term → floor = 2
        if first_words >= 20 and _is_grounded(prompts[0]):
            a1_floor = 2.0
        # Ceiling: first_prompt_words < 8 → ceiling = 2
        if first_words < 8:
            a1_ceiling = 2.0

    if conv_eval is not None:
        a1 = _clamp(0.4 * a1_metric + 0.6 * conv_eval.a1_understanding, a1_floor, a1_ceiling)
    else:
        a1 = _clamp(a1_metric, a1_floor, a1_ceiling)

    # ── A2 — Decomposition / Plan (0-7) ──
    a2_metric = 0.0
    a2_floor = 0.0
    if prompt_events:
        first_prompt_ts = prompt_events[0].ts
        files_before = sum(1 for e in file_open_events if e.ts < first_prompt_ts)
        minutes_to_first = (first_prompt_ts - start_ms) / 60_000

        if files_before >= 3:
            a2_metric += 3.0
        elif files_before >= 1:
            a2_metric += 2.0

        if 2 <= minutes_to_first <= 20:
            a2_metric += 2.0
        elif minutes_to_first > 0:
            a2_metric += 1.0

        # Floor: files >= 3 AND time >= 2 min → 3; files >= 1 AND time >= 1 → 2
        if files_before >= 3 and minutes_to_first >= 2:
            a2_floor = 3.0
        elif files_before >= 1 and minutes_to_first >= 1:
            a2_floor = 2.0

    if conv_eval is not None:
        a2 = _clamp(0.3 * a2_metric + 0.7 * conv_eval.a2_decomposition, a2_floor, 7)
    else:
        a2 = _clamp(a2_metric, a2_floor, 7)

    # ── A3 — Justification (0-7) — pure semantic ──
    if conv_eval is not None:
        a3 = _clamp(conv_eval.a3_justification, 0, 7)
    else:
        # Metric fallback: dialogue depth as proxy
        n_prompts = len(prompts)
        if n_prompts >= 7:
            a3 = 3.0
        elif n_prompts >= 4:
            a3 = 2.0
        elif n_prompts >= 2:
            a3 = 1.0
        else:
            a3 = 0.0

    # ── A4 — Edge Cases (0-5) — blended 50/50 ──
    edge_count = sum(1 for p in prompts if _has_edge_case_language(p))
    if edge_count >= 4:
        a4_metric = 3.0
    elif edge_count >= 2:
        a4_metric = 2.0
    elif edge_count >= 1:
        a4_metric = 1.0
    else:
        a4_metric = 0.0

    if conv_eval is not None:
        a4 = _clamp(0.5 * a4_metric + 0.5 * conv_eval.a4_edge_cases, 0, 5)
    else:
        a4 = _clamp(a4_metric, 0, 5)

    return {"a1": round(a1, 1), "a2": round(a2, 1), "a3": round(a3, 1), "a4": round(a4, 1)}


# ---------- Category B: Code Quality (0-25) ----------

def _score_code_quality(session: Session, conv_eval=None, code_eval=None, test_results=None) -> dict:
    """
    B1: Clarity/Readability (0-8) — pure semantic (code analysis)
    B2: Correctness (0-7) — execution-gated semantic
    B3: Efficiency (0-5) — blended conv+code semantic
    B4: AI Code Ownership (0-5) — blended metric+semantic
    """
    prompts = _user_prompts(session)
    responses = _ai_responses(session)
    prompt_events = _events_of(session, "prompt_sent")
    edit_events = _events_of(session, "file_edit")

    # ── B1 — Clarity (0-8) — pure semantic code analysis ──
    if code_eval is not None:
        b1 = _clamp(code_eval.b1_clarity, 0, 8)
    else:
        b1 = 4.0  # mid-range default

    # ── B2 — Correctness (0-7) — execution-gated semantic ──
    b2_cap = _compute_b2_cap(test_results)
    if code_eval is not None:
        b2_semantic = _clamp(code_eval.b2_correctness, 0, 7)
        b2 = min(b2_cap, b2_semantic)
    else:
        b2 = min(b2_cap, 3.5)  # mid-range default, still gated

    # ── B3 — Efficiency (0-5) — blended conv+code semantic ──
    if conv_eval is not None and code_eval is not None:
        b3 = _clamp(
            round(0.4 * conv_eval.b3_efficiency_discussion + 0.6 * code_eval.b3_efficiency_code, 1),
            0, 5,
        )
    elif code_eval is not None:
        b3 = _clamp(code_eval.b3_efficiency_code, 0, 5)
    elif conv_eval is not None:
        b3 = _clamp(conv_eval.b3_efficiency_discussion, 0, 5)
    else:
        b3 = 2.5  # mid-range default

    # ── B4 — AI Code Ownership (0-5) — blended metric + semantic ──
    b4_metric = 0.0
    if prompt_events:
        mod_count = 0
        for i, p_event in enumerate(prompt_events):
            window_start = p_event.ts
            window_end = prompt_events[i + 1].ts if i + 1 < len(prompt_events) else float("inf")
            if any(window_start < e.ts < window_end for e in edit_events):
                mod_count += 1

        mod_rate = mod_count / len(prompt_events)
        if mod_rate >= 0.75:
            b4_metric = 3.0
        elif mod_rate >= 0.5:
            b4_metric = 2.0
        elif mod_rate >= 0.25:
            b4_metric = 1.0

        # ai_apply_without_edit_rate bonus
        ai_apply_events = _events_of(session, "ai_apply")
        if ai_apply_events:
            apply_no_edit = 0
            for ae in ai_apply_events:
                has_edit_after = any(
                    e.ts > ae.ts and e.ts < ae.ts + 30_000
                    for e in edit_events
                )
                if not has_edit_after:
                    apply_no_edit += 1
            apply_no_edit_rate = apply_no_edit / len(ai_apply_events)
            if apply_no_edit_rate < 0.3:
                b4_metric += 1.0

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
                b4_metric += 1.5
            elif evidence_frac >= 0.25:
                b4_metric += 1.0
            elif evidence_frac > 0:
                b4_metric += 0.5

    if conv_eval is not None:
        b4 = _clamp(0.4 * b4_metric + 0.6 * conv_eval.b4_ownership_dialogue, 0, 5)
    else:
        b4 = _clamp(b4_metric, 0, 5)

    return {
        "b1": round(b1, 1),
        "b2": round(b2, 1),
        "b3": round(b3, 1),
        "b4": round(b4, 1),
    }


# ---------- Category C: Verification (0-25) ----------

def _score_verification(session: Session, conv_eval=None) -> dict:
    """
    C1: Execution Frequency (0-8) — pure metric
    C2: Test Coverage (0-9) — semantic + metric floor
    C3: AI Output Validation (0-4) — blended 50/50
    C4: Debug Discipline (0-4) — pure metric
    """
    test_events = _events_of(session, "test_run")
    prompt_events = _events_of(session, "prompt_sent")
    edit_events = _events_of(session, "file_edit")
    ai_apply_events = _events_of(session, "ai_apply")

    n_tests = len(test_events)

    # ── C1 — Execution Frequency (0-8) — pure metric ──
    if n_tests >= 4:
        c1 = 8.0
    elif n_tests >= 2:
        c1 = 6.0
    elif n_tests == 1:
        c1 = 3.0
    else:
        c1 = 0.0

    # ── C2 — Test Coverage (0-9) — semantic + metric floor ──
    c2_metric = 3.0 if n_tests >= 1 else 0.0
    c2_floor = 3.0 if n_tests >= 1 else 0.0

    if conv_eval is not None:
        c2 = _clamp(0.3 * c2_metric + 0.7 * conv_eval.c2_test_mentions, c2_floor, 9)
    else:
        c2 = _clamp(c2_metric, c2_floor, 9)

    # ── C3 — AI Output Validation (0-4) — blended 50/50 ──
    c3_metric = 0.0
    if prompt_events and test_events:
        tests_after_ai = 0
        for i, p_event in enumerate(prompt_events):
            window_start = p_event.ts
            window_end = prompt_events[i + 1].ts if i + 1 < len(prompt_events) else float("inf")
            if any(window_start < t.ts < window_end for t in test_events):
                tests_after_ai += 1
        rate = tests_after_ai / len(prompt_events) if prompt_events else 0
        if rate >= 0.5:
            c3_metric = 2.0
        elif rate >= 0.25:
            c3_metric = 1.0

    # ai_apply_without_edit_rate bonus for C3
    if ai_apply_events and edit_events:
        apply_no_edit = 0
        for ae in ai_apply_events:
            has_edit_after = any(
                e.ts > ae.ts and e.ts < ae.ts + 30_000
                for e in edit_events
            )
            if not has_edit_after:
                apply_no_edit += 1
        if len(ai_apply_events) > 0 and (apply_no_edit / len(ai_apply_events)) < 0.3:
            c3_metric += 1.0

    if conv_eval is not None:
        c3 = _clamp(0.5 * c3_metric + 0.5 * conv_eval.c3_ai_questioning, 0, 4)
    else:
        c3 = _clamp(c3_metric, 0, 4)

    # ── C4 — Debug Discipline (0-4) — pure metric ──
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

    return {
        "c1": round(c1, 1),
        "c2": round(c2, 1),
        "c3": round(c3, 1),
        "c4": round(c4, 1),
    }


# ---------- Category D: Communication (0-25) ----------

def _score_communication(session: Session, conv_eval=None) -> dict:
    """
    D1: Continuous Narration (0-8) — semantic + metric floor
    D2: Tradeoffs and Decisions (0-7) — pure semantic
    D3: AI Collaboration Balance (0-5) — blended 40/60
    D4: Status Summaries (0-5) — pure semantic
    """
    prompts = _user_prompts(session)
    if not prompts:
        return {"d1": 0.0, "d2": 0.0, "d3": 0.0, "d4": 0.0}

    n = len(prompts)

    # ── D1 — Narration (0-8) — semantic + metric floor ──
    avg_len = sum(len(p.split()) for p in prompts) / n
    if avg_len >= 50:
        d1_metric = 3.0
    elif avg_len >= 25:
        d1_metric = 2.0
    elif avg_len >= 10:
        d1_metric = 1.0
    else:
        d1_metric = 0.0

    # Metric floor: avg >= 25 → floor 2, >= 10 → floor 1
    d1_floor = 0.0
    if avg_len >= 25:
        d1_floor = 2.0
    elif avg_len >= 10:
        d1_floor = 1.0

    if conv_eval is not None:
        d1 = _clamp(0.3 * d1_metric + 0.7 * conv_eval.d1_narration, d1_floor, 8)
    else:
        d1 = _clamp(d1_metric, d1_floor, 8)

    # ── D2 — Tradeoffs (0-7) — pure semantic ──
    if conv_eval is not None:
        d2 = _clamp(conv_eval.d2_tradeoffs, 0, 7)
    else:
        # Metric fallback: tradeoff keyword count
        tradeoff_count = sum(1 for p in prompts if _has_tradeoff_language(p))
        if tradeoff_count >= 3:
            d2 = 3.0
        elif tradeoff_count >= 2:
            d2 = 2.0
        elif tradeoff_count >= 1:
            d2 = 1.0
        else:
            d2 = 0.0

    # ── D3 — AI Collaboration Balance (0-5) — blended 40/60 ──
    d3_metric = 0.0
    grounded_count = sum(1 for p in prompts if _is_grounded(p))
    grounded_frac = grounded_count / n
    if grounded_frac >= 0.6:
        d3_metric += 2.0
    elif grounded_frac >= 0.3:
        d3_metric += 1.0

    if n >= 2:
        similar_pairs = sum(
            1 for a, b in zip(prompts, prompts[1:])
            if _word_overlap(a, b) > 0.6
        )
        passive_rate = similar_pairs / (n - 1)
        if passive_rate <= 0.1:
            d3_metric += 2.0
        elif passive_rate <= 0.3:
            d3_metric += 1.0

    if conv_eval is not None:
        d3 = _clamp(0.4 * d3_metric + 0.6 * conv_eval.d3_ai_balance, 0, 5)
    else:
        d3 = _clamp(d3_metric, 0, 5)

    # ── D4 — Status Summaries (0-5) — pure semantic ──
    if conv_eval is not None:
        d4 = _clamp(conv_eval.d4_status_updates, 0, 5)
    else:
        # Metric fallback: dialogue depth
        if n >= 5:
            d4 = 2.0
        elif n >= 3:
            d4 = 1.0
        else:
            d4 = 0.0

    return {
        "d1": round(d1, 1),
        "d2": round(d2, 1),
        "d3": round(d3, 1),
        "d4": round(d4, 1),
    }


# ---------- Penalties ----------

def _compute_penalties(session: Session, metrics: HeadlineMetrics,
                       conv_eval=None, code_eval=None, test_results=None) -> dict:
    """
    P1: Over-reliance on AI (0, -5, -10, or -15) — metric + semantic modifier
    P2: No-run (-10 if zero test_run events) — pure metric
    P3: Critical miss (0 or -10) — execution primary, semantic fallback
    """
    test_events = _events_of(session, "test_run")

    # ── P1 — Over-reliance on AI ──
    if metrics.blind_adoption_rate > 0.8:
        p1 = -15
    elif metrics.blind_adoption_rate > 0.6:
        p1 = -10
    elif metrics.blind_adoption_rate > 0.4:
        p1 = -5
    else:
        p1 = 0

    # Semantic modifier: if B4 ownership >= 3, reduce penalty by one tier
    if conv_eval is not None and conv_eval.b4_ownership_dialogue >= 3.0 and p1 < 0:
        p1 = min(p1 + 5, 0)  # reduce magnitude by one tier (5 points)

    # ── P2 — No-run ──
    p2 = -10 if not test_events else 0

    # ── P3 — Critical miss ──
    # Primary: test results (core test failures)
    # Fallback: semantic code analysis (p3_critical_miss flag)
    p3 = 0
    if test_results is not None and test_results.core_failures:
        p3 = -10
    elif test_results is None and code_eval is not None and code_eval.p3_critical_miss:
        p3 = -10

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


# ---------- Compute ai_apply_without_edit_rate ----------

def _compute_ai_apply_without_edit_rate(session: Session) -> float:
    """Fraction of ai_apply events with no file_edit within 30 seconds."""
    ai_apply_events = _events_of(session, "ai_apply")
    edit_events = _events_of(session, "file_edit")
    if not ai_apply_events:
        return 0.0
    no_edit_count = 0
    for ae in ai_apply_events:
        has_edit = any(
            e.ts > ae.ts and e.ts < ae.ts + 30_000
            for e in edit_events
        )
        if not has_edit:
            no_edit_count += 1
    return round(no_edit_count / len(ai_apply_events), 2)


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
      semantic_eval: Legacy 2-dimension eval (backward compat, used if conv_eval is None)
      conv_eval: 12-dimension conversation eval (ConversationSemanticEval)
      code_eval: Code analysis eval (CodeSemanticEval)
      test_results: Test suite results (TestSuiteResult)

    Falls back to pure metrics if all evals are None.
    """
    # If conv_eval not provided but semantic_eval is, use it for legacy compat
    effective_conv_eval = conv_eval or semantic_eval

    metrics = compute_headline_metrics(session)

    # Populate new headline metrics
    metrics.ai_apply_without_edit_rate = _compute_ai_apply_without_edit_rate(session)
    if test_results is not None:
        metrics.test_pass_rate = test_results.pass_rate
    else:
        metrics.test_pass_rate = -1.0

    # Score each category with eval sources
    a = _score_problem_solving(session, conv_eval=effective_conv_eval)
    b = _score_code_quality(session, conv_eval=effective_conv_eval, code_eval=code_eval, test_results=test_results)
    c = _score_verification(session, conv_eval=effective_conv_eval)
    d = _score_communication(session, conv_eval=effective_conv_eval)
    penalties = _compute_penalties(session, metrics,
                                  conv_eval=effective_conv_eval,
                                  code_eval=code_eval,
                                  test_results=test_results)

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

    # Interpretation: prefer conv_eval interpretation, then semantic_eval, then build from metrics
    if effective_conv_eval is not None and hasattr(effective_conv_eval, 'interpretation'):
        interpretation = effective_conv_eval.interpretation
    else:
        interpretation = _build_interpretation(total, breakdown, metrics)

    # Include test suite results in the score if available
    test_suite = test_results if test_results is not None else None

    return Score(
        total_score=total,
        breakdown=breakdown,
        headline_metrics=metrics,
        interpretation=interpretation,
        badge=badge,
        rubric_breakdown=rubric_breakdown,
        sub_criteria=sub_criteria,
        penalty_detail=penalty_detail,
        test_suite=test_suite,
    )
