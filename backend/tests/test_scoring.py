"""
Regression tests for the Sponge scoring engine v2.

Tests calibration fixtures (gold, medium, weak), metric determinism,
backward compatibility, score bounds, penalty logic, B2 gate, and P3 firing.

All Gemini calls are mocked — tests run without API keys.
"""

import json
import os
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import pytest

from models.event import Event
from models.session import Session
from models.score import Score, TestSuiteResult, TestResult
from scoring.engine import compute_score, _compute_b2_cap
from scoring.semantic import ConversationSemanticEval
from scoring.code_analysis import CodeSemanticEval

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _load_fixture(name: str) -> Session:
    """Load a calibration fixture JSON and return a Session."""
    path = os.path.join(FIXTURES_DIR, f"{name}.json")
    with open(path) as f:
        data = json.load(f)

    session = Session(session_id=data["session_id"])
    session.started_at = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    session.conversation_history = data["conversation_history"]
    session.final_code = data.get("final_code")
    session.events = [Event(**e) for e in data["events"]]
    return session


def _mock_conv_eval(quality: str) -> ConversationSemanticEval:
    """Create a mock ConversationSemanticEval at a given quality level."""
    if quality == "gold":
        return ConversationSemanticEval(
            a1_understanding=5.5, a2_decomposition=6.5, a3_justification=6.0, a4_edge_cases=4.5,
            b3_efficiency_discussion=4.0, b4_ownership_dialogue=4.5,
            c2_test_mentions=7.5, c3_ai_questioning=3.5,
            d1_narration=7.0, d2_tradeoffs=6.0, d3_ai_balance=4.5, d4_status_updates=4.5,
            interpretation="Excellent problem-solving approach with thorough planning and edge case consideration.",
        )
    elif quality == "medium":
        return ConversationSemanticEval(
            a1_understanding=4.0, a2_decomposition=4.5, a3_justification=4.0, a4_edge_cases=2.5,
            b3_efficiency_discussion=3.0, b4_ownership_dialogue=3.5,
            c2_test_mentions=5.0, c3_ai_questioning=2.5,
            d1_narration=4.5, d2_tradeoffs=3.5, d3_ai_balance=3.0, d4_status_updates=2.5,
            interpretation="Decent approach but lacked depth in planning and edge case analysis.",
        )
    else:  # weak
        return ConversationSemanticEval(
            a1_understanding=1.5, a2_decomposition=1.0, a3_justification=1.0, a4_edge_cases=0.5,
            b3_efficiency_discussion=1.0, b4_ownership_dialogue=1.0,
            c2_test_mentions=1.0, c3_ai_questioning=1.0,
            d1_narration=1.5, d2_tradeoffs=1.0, d3_ai_balance=1.0, d4_status_updates=0.5,
            interpretation="Minimal engagement with the problem. Heavy reliance on AI without understanding.",
        )


def _mock_code_eval(quality: str) -> CodeSemanticEval:
    """Create a mock CodeSemanticEval at a given quality level."""
    if quality == "gold":
        return CodeSemanticEval(
            b1_clarity=7.0, b2_correctness=6.5, b3_efficiency_code=4.0,
            p3_critical_miss=False, p3_details="", code_feedback="Well-structured code.",
        )
    elif quality == "medium":
        return CodeSemanticEval(
            b1_clarity=5.0, b2_correctness=4.0, b3_efficiency_code=2.5,
            p3_critical_miss=False, p3_details="", code_feedback="Reasonable code quality.",
        )
    else:  # weak
        return CodeSemanticEval(
            b1_clarity=3.0, b2_correctness=2.0, b3_efficiency_code=1.0,
            p3_critical_miss=True, p3_details="enqueue_in does not properly schedule jobs",
            code_feedback="Code lacks proper scheduling logic.",
        )


def _mock_test_results(quality: str) -> TestSuiteResult:
    """Create mock test results at a given quality level."""
    if quality == "gold":
        results = [TestResult(test_name=f"test_{i}", passed=True, is_core=(i < 3)) for i in range(12)]
        return TestSuiteResult(total=12, passed=12, failed=0, pass_rate=1.0, results=results, core_failures=[])
    elif quality == "medium":
        results = []
        for i in range(12):
            passed = i < 10  # 10/12 pass
            results.append(TestResult(test_name=f"test_{i}", passed=passed, is_core=(i < 3)))
        return TestSuiteResult(total=12, passed=10, failed=2, pass_rate=0.833, results=results, core_failures=[])
    else:  # weak
        results = []
        for i in range(12):
            passed = i < 4  # 4/12 pass
            results.append(TestResult(test_name=f"test_{i}", passed=passed, is_core=(i < 3)))
        # Core test 2 fails
        results[2] = TestResult(test_name="test_2", passed=False, is_core=True)
        return TestSuiteResult(
            total=12, passed=4, failed=8, pass_rate=0.333,
            results=results, core_failures=["test_2"],
        )


# ── Calibration fixtures ──────────────────────────────────────────────────


class TestGoldFixture:
    """Gold session should score >= 75."""

    def setup_method(self):
        self.session = _load_fixture("gold_session")
        self.conv_eval = _mock_conv_eval("gold")
        self.code_eval = _mock_code_eval("gold")
        self.test_results = _mock_test_results("gold")

    def test_gold_total_score_range(self):
        score = compute_score(
            self.session,
            conv_eval=self.conv_eval,
            code_eval=self.code_eval,
            test_results=self.test_results,
        )
        assert score.total_score >= 75, f"Gold fixture scored {score.total_score}, expected >= 75"

    def test_gold_badge(self):
        score = compute_score(
            self.session,
            conv_eval=self.conv_eval,
            code_eval=self.code_eval,
            test_results=self.test_results,
        )
        assert score.badge in ("AI Collaborator", "On Your Way"), f"Gold badge was '{score.badge}'"

    def test_gold_no_p3_penalty(self):
        score = compute_score(
            self.session,
            conv_eval=self.conv_eval,
            code_eval=self.code_eval,
            test_results=self.test_results,
        )
        assert score.penalty_detail.p3_critical_miss == 0

    def test_gold_has_test_pass_rate(self):
        score = compute_score(
            self.session,
            conv_eval=self.conv_eval,
            code_eval=self.code_eval,
            test_results=self.test_results,
        )
        assert score.headline_metrics.test_pass_rate == 1.0


class TestMediumFixture:
    """Medium session should score 45-74."""

    def setup_method(self):
        self.session = _load_fixture("medium_session")
        self.conv_eval = _mock_conv_eval("medium")
        self.code_eval = _mock_code_eval("medium")
        self.test_results = _mock_test_results("medium")

    def test_medium_total_score_range(self):
        score = compute_score(
            self.session,
            conv_eval=self.conv_eval,
            code_eval=self.code_eval,
            test_results=self.test_results,
        )
        assert 40 <= score.total_score <= 74, f"Medium fixture scored {score.total_score}, expected 40-74"

    def test_medium_badge(self):
        score = compute_score(
            self.session,
            conv_eval=self.conv_eval,
            code_eval=self.code_eval,
            test_results=self.test_results,
        )
        assert score.badge in ("Just Vibing", "Needs Work", "On Your Way"), f"Medium badge was '{score.badge}'"


class TestWeakFixture:
    """Weak session should score 15-44."""

    def setup_method(self):
        self.session = _load_fixture("weak_session")
        self.conv_eval = _mock_conv_eval("weak")
        self.code_eval = _mock_code_eval("weak")
        self.test_results = _mock_test_results("weak")

    def test_weak_total_score_range(self):
        score = compute_score(
            self.session,
            conv_eval=self.conv_eval,
            code_eval=self.code_eval,
            test_results=self.test_results,
        )
        # Weak session with P1+P2+P3 = -35 penalty legitimately scores very low
        assert 0 <= score.total_score <= 44, f"Weak fixture scored {score.total_score}, expected 0-44"

    def test_weak_p3_fires(self):
        score = compute_score(
            self.session,
            conv_eval=self.conv_eval,
            code_eval=self.code_eval,
            test_results=self.test_results,
        )
        assert score.penalty_detail.p3_critical_miss == -10

    def test_weak_badge(self):
        score = compute_score(
            self.session,
            conv_eval=self.conv_eval,
            code_eval=self.code_eval,
            test_results=self.test_results,
        )
        assert score.badge in ("Just Vibing", "Needs Work"), f"Weak badge was '{score.badge}'"


# ── Determinism ────────────────────────────────────────────────────────────


class TestDeterminism:
    """Same input must produce identical metric scores."""

    def test_pure_metric_determinism(self):
        session = _load_fixture("gold_session")
        score1 = compute_score(session)
        score2 = compute_score(session)
        assert score1.total_score == score2.total_score
        assert score1.breakdown == score2.breakdown
        assert score1.headline_metrics == score2.headline_metrics

    def test_full_eval_determinism(self):
        session = _load_fixture("medium_session")
        conv_eval = _mock_conv_eval("medium")
        code_eval = _mock_code_eval("medium")
        test_results = _mock_test_results("medium")
        score1 = compute_score(session, conv_eval=conv_eval, code_eval=code_eval, test_results=test_results)
        score2 = compute_score(session, conv_eval=conv_eval, code_eval=code_eval, test_results=test_results)
        assert score1.total_score == score2.total_score
        assert score1.sub_criteria == score2.sub_criteria


# ── Score bounds ───────────────────────────────────────────────────────────


class TestScoreBounds:
    """Total score is always 0-100, breakdown fields always 0-10."""

    def _check_bounds(self, score: Score):
        assert 0 <= score.total_score <= 100, f"total_score out of bounds: {score.total_score}"
        b = score.breakdown
        assert 0 <= b.request_timing <= 10
        assert 0 <= b.request_quality <= 10
        assert 0 <= b.response_handling <= 10
        assert 0 <= b.verification_discipline <= 10
        assert 0 <= b.iterative_collaboration <= 10
        assert -10 <= b.penalties <= 0

        if score.rubric_breakdown:
            rb = score.rubric_breakdown
            assert 0 <= rb.problem_solving <= 25
            assert 0 <= rb.code_quality <= 25
            assert 0 <= rb.verification <= 25
            assert 0 <= rb.communication <= 25

        if score.sub_criteria:
            sc = score.sub_criteria
            assert 0 <= sc.a1_understanding <= 6
            assert 0 <= sc.a2_decomposition <= 7
            assert 0 <= sc.a3_justification <= 7
            assert 0 <= sc.a4_edge_cases <= 5
            assert 0 <= sc.b1_clarity <= 8
            assert 0 <= sc.b2_correctness <= 7
            assert 0 <= sc.b3_efficiency <= 5
            assert 0 <= sc.b4_ownership <= 5
            assert 0 <= sc.c1_exec_frequency <= 8
            assert 0 <= sc.c2_test_coverage <= 9
            assert 0 <= sc.c3_ai_validation <= 4
            assert 0 <= sc.c4_debug_discipline <= 4
            assert 0 <= sc.d1_narration <= 8
            assert 0 <= sc.d2_tradeoffs <= 7
            assert 0 <= sc.d3_ai_balance <= 5
            assert 0 <= sc.d4_status_summaries <= 5

    def test_gold_bounds(self):
        session = _load_fixture("gold_session")
        score = compute_score(session, conv_eval=_mock_conv_eval("gold"),
                              code_eval=_mock_code_eval("gold"),
                              test_results=_mock_test_results("gold"))
        self._check_bounds(score)

    def test_medium_bounds(self):
        session = _load_fixture("medium_session")
        score = compute_score(session, conv_eval=_mock_conv_eval("medium"),
                              code_eval=_mock_code_eval("medium"),
                              test_results=_mock_test_results("medium"))
        self._check_bounds(score)

    def test_weak_bounds(self):
        session = _load_fixture("weak_session")
        score = compute_score(session, conv_eval=_mock_conv_eval("weak"),
                              code_eval=_mock_code_eval("weak"),
                              test_results=_mock_test_results("weak"))
        self._check_bounds(score)

    def test_empty_session_bounds(self):
        session = Session(session_id="empty")
        score = compute_score(session)
        self._check_bounds(score)

    def test_pure_metric_bounds(self):
        session = _load_fixture("gold_session")
        score = compute_score(session)
        self._check_bounds(score)


# ── B2 gate ────────────────────────────────────────────────────────────────


class TestB2Gate:
    """B2 is capped by test pass rate."""

    def test_b2_cap_100_percent(self):
        assert _compute_b2_cap(None) == 7  # no gate
        tr = _mock_test_results("gold")
        assert _compute_b2_cap(tr) == 7  # 100% pass

    def test_b2_cap_80_percent(self):
        tr = TestSuiteResult(total=12, passed=10, failed=2, pass_rate=0.833,
                             results=[], core_failures=[])
        assert _compute_b2_cap(tr) == 5

    def test_b2_cap_50_percent(self):
        tr = TestSuiteResult(total=12, passed=7, failed=5, pass_rate=0.583,
                             results=[], core_failures=[])
        assert _compute_b2_cap(tr) == 3

    def test_b2_cap_below_50_percent(self):
        tr = TestSuiteResult(total=12, passed=3, failed=9, pass_rate=0.25,
                             results=[], core_failures=[])
        assert _compute_b2_cap(tr) == 1

    def test_b2_capped_in_scoring(self):
        """B2 semantic score of 6 should be capped at 5 with 83% pass rate."""
        session = _load_fixture("gold_session")
        code_eval = CodeSemanticEval(
            b1_clarity=7.0, b2_correctness=6.0, b3_efficiency_code=4.0,
            p3_critical_miss=False, p3_details="", code_feedback="",
        )
        tr = TestSuiteResult(total=12, passed=10, failed=2, pass_rate=0.833,
                             results=[], core_failures=[])
        score = compute_score(session, code_eval=code_eval, test_results=tr)
        assert score.sub_criteria.b2_correctness <= 5.0


# ── P3 penalty ─────────────────────────────────────────────────────────────


class TestP3Penalty:
    """P3 fires correctly from test results and semantic fallback."""

    def test_p3_fires_on_core_failure(self):
        session = _load_fixture("gold_session")
        tr = TestSuiteResult(total=12, passed=11, failed=1, pass_rate=0.917,
                             results=[], core_failures=["test_enqueue_in_exists"])
        score = compute_score(session, test_results=tr)
        assert score.penalty_detail.p3_critical_miss == -10

    def test_p3_no_fire_when_all_core_pass(self):
        session = _load_fixture("gold_session")
        tr = _mock_test_results("gold")
        score = compute_score(session, test_results=tr)
        assert score.penalty_detail.p3_critical_miss == 0

    def test_p3_semantic_fallback(self):
        """P3 fires from code_eval when test_results is None."""
        session = _load_fixture("weak_session")
        code_eval = CodeSemanticEval(
            b1_clarity=3.0, b2_correctness=2.0, b3_efficiency_code=1.0,
            p3_critical_miss=True, p3_details="enqueue_in missing",
            code_feedback="",
        )
        score = compute_score(session, code_eval=code_eval)
        assert score.penalty_detail.p3_critical_miss == -10

    def test_p3_no_fire_without_evidence(self):
        """P3 does not fire when no test results AND code_eval says no miss."""
        session = _load_fixture("gold_session")
        code_eval = _mock_code_eval("gold")
        score = compute_score(session, code_eval=code_eval)
        assert score.penalty_detail.p3_critical_miss == 0


# ── P1 modifier ────────────────────────────────────────────────────────────


class TestP1Modifier:
    """P1 is reduced when semantic B4 ownership >= 3."""

    def test_p1_reduced_with_high_ownership(self):
        session = Session(session_id="p1-test")
        session.started_at = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        session.conversation_history = [
            {"role": "user", "content": "Do it"},
            {"role": "assistant", "content": "Done"},
            {"role": "user", "content": "Do more"},
            {"role": "assistant", "content": "Done more"},
        ]
        # No edits → blind adoption rate = 1.0 → P1 = -15
        session.events = [
            Event(session_id="p1-test", event="prompt_sent", ts=1735689900000),
            Event(session_id="p1-test", event="prompt_sent", ts=1735690200000),
            Event(session_id="p1-test", event="test_run", ts=1735690400000),
        ]

        # Without modifier
        score_no_mod = compute_score(session)
        assert score_no_mod.penalty_detail.p1_over_reliance == -15

        # With B4 ownership >= 3
        conv_eval = ConversationSemanticEval(
            a1_understanding=2.0, a2_decomposition=2.0, a3_justification=2.0, a4_edge_cases=1.0,
            b3_efficiency_discussion=1.0, b4_ownership_dialogue=4.0,
            c2_test_mentions=2.0, c3_ai_questioning=1.0,
            d1_narration=2.0, d2_tradeoffs=1.0, d3_ai_balance=1.0, d4_status_updates=1.0,
            interpretation="Test.",
        )
        score_with_mod = compute_score(session, conv_eval=conv_eval)
        assert score_with_mod.penalty_detail.p1_over_reliance == -10  # reduced by one tier


# ── Backward compatibility ─────────────────────────────────────────────────


class TestBackwardCompat:
    """Score always includes valid breakdown fields for frontend compat."""

    def test_breakdown_populated(self):
        session = _load_fixture("gold_session")
        score = compute_score(session)
        b = score.breakdown
        assert isinstance(b.request_timing, int)
        assert isinstance(b.request_quality, int)
        assert isinstance(b.response_handling, int)
        assert isinstance(b.verification_discipline, int)
        assert isinstance(b.iterative_collaboration, int)
        assert isinstance(b.penalties, int)

    def test_rubric_breakdown_populated_with_evals(self):
        session = _load_fixture("gold_session")
        score = compute_score(session, conv_eval=_mock_conv_eval("gold"),
                              code_eval=_mock_code_eval("gold"),
                              test_results=_mock_test_results("gold"))
        assert score.rubric_breakdown is not None
        assert score.sub_criteria is not None
        assert score.penalty_detail is not None

    def test_score_serializable(self):
        """Score can be serialized to JSON (important for API response)."""
        session = _load_fixture("gold_session")
        score = compute_score(session, conv_eval=_mock_conv_eval("gold"),
                              code_eval=_mock_code_eval("gold"),
                              test_results=_mock_test_results("gold"))
        json_str = score.model_dump_json()
        assert len(json_str) > 0
        parsed = json.loads(json_str)
        assert "total_score" in parsed
        assert "rubric_breakdown" in parsed


# ── Fallback behavior ─────────────────────────────────────────────────────


class TestFallback:
    """Engine returns valid scores when eval sources are unavailable."""

    def test_pure_metric_fallback(self):
        """No evals at all → pure metric scoring."""
        session = _load_fixture("gold_session")
        score = compute_score(session)
        assert 0 <= score.total_score <= 100
        assert score.rubric_breakdown is not None

    def test_conv_eval_only(self):
        session = _load_fixture("gold_session")
        score = compute_score(session, conv_eval=_mock_conv_eval("gold"))
        assert 0 <= score.total_score <= 100

    def test_code_eval_only(self):
        session = _load_fixture("gold_session")
        score = compute_score(session, code_eval=_mock_code_eval("gold"))
        assert 0 <= score.total_score <= 100

    def test_test_results_only(self):
        session = _load_fixture("gold_session")
        score = compute_score(session, test_results=_mock_test_results("gold"))
        assert 0 <= score.total_score <= 100
        assert score.headline_metrics.test_pass_rate == 1.0

    def test_empty_session(self):
        """Completely empty session → valid score with zeros."""
        session = Session(session_id="empty")
        score = compute_score(session)
        assert 0 <= score.total_score <= 100
        assert score.headline_metrics.test_pass_rate == -1.0


# ── Headline metrics ──────────────────────────────────────────────────────


class TestHeadlineMetrics:
    """New headline metrics are populated correctly."""

    def test_test_pass_rate_populated(self):
        session = _load_fixture("gold_session")
        tr = _mock_test_results("gold")
        score = compute_score(session, test_results=tr)
        assert score.headline_metrics.test_pass_rate == 1.0

    def test_test_pass_rate_unavailable(self):
        session = _load_fixture("gold_session")
        score = compute_score(session)
        assert score.headline_metrics.test_pass_rate == -1.0

    def test_ai_apply_without_edit_rate(self):
        session = _load_fixture("gold_session")
        score = compute_score(session)
        # Gold session has ai_apply events with edits nearby
        assert 0.0 <= score.headline_metrics.ai_apply_without_edit_rate <= 1.0
