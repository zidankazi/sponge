from typing import Optional
from pydantic import BaseModel


class ScoreBreakdown(BaseModel):
    request_timing: int
    request_quality: int
    response_handling: int
    verification_discipline: int
    iterative_collaboration: int
    penalties: int


class HeadlineMetrics(BaseModel):
    blind_adoption_rate: float
    ai_modification_rate: float
    test_after_ai_rate: float
    passive_reprompt_rate: float
    grounded_prompt_rate: float
    evidence_grounded_followup_rate: float
    ai_apply_without_edit_rate: float = 0.0
    test_pass_rate: float = -1.0


class RubricBreakdown(BaseModel):
    problem_solving: float    # A: 0-25
    code_quality: float       # B: 0-25
    verification: float       # C: 0-25
    communication: float      # D: 0-25


class SubCriteriaDetail(BaseModel):
    a1_understanding: float   # 0-6
    a2_decomposition: float   # 0-7
    a3_justification: float   # 0-7
    a4_edge_cases: float      # 0-5
    b1_clarity: float         # 0-8
    b2_correctness: float     # 0-7
    b3_efficiency: float      # 0-5
    b4_ownership: float       # 0-5
    c1_exec_frequency: float  # 0-8
    c2_test_coverage: float   # 0-9
    c3_ai_validation: float   # 0-4
    c4_debug_discipline: float  # 0-4
    d1_narration: float       # 0-8
    d2_tradeoffs: float       # 0-7
    d3_ai_balance: float      # 0-5
    d4_status_summaries: float  # 0-5


class PenaltyDetail(BaseModel):
    p1_over_reliance: int     # 0, -5, -10, or -15
    p2_no_run: int            # 0 or -10
    p3_critical_miss: int     # 0 or -10


class TestResult(BaseModel):
    test_name: str
    passed: bool
    error_message: Optional[str] = None
    is_core: bool = False


class TestSuiteResult(BaseModel):
    total: int
    passed: int
    failed: int
    pass_rate: float          # 0.0 - 1.0
    results: list[TestResult]
    core_failures: list[str]  # Names of failed core tests


class Score(BaseModel):
    total_score: int
    breakdown: ScoreBreakdown
    headline_metrics: HeadlineMetrics
    interpretation: str
    badge: str
    rubric_breakdown: Optional[RubricBreakdown] = None
    sub_criteria: Optional[SubCriteriaDetail] = None
    penalty_detail: Optional[PenaltyDetail] = None
    test_suite: Optional[TestSuiteResult] = None
