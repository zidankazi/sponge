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


class Score(BaseModel):
    total_score: int
    breakdown: ScoreBreakdown
    headline_metrics: HeadlineMetrics
    interpretation: str
    badge: str
