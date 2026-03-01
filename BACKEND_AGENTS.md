# BACKEND_AGENTS.md — Backend Claude Code Context

Read `AGENTS.md` first for full project context. This file is backend-specific.

## Stack

- **Framework**: FastAPI
- **AI**: Gemini API (Google)
- **Storage**: In-memory for hackathon (dict-based session store)
- **Python**: 3.10+

## API Endpoints

All endpoints are defined in `routes/`. Each route file handles one endpoint group.

### `POST /session/start` (`routes/session.py`)

Creates a new session. Generates a session ID, initializes session storage.

```json
// Response
{ "session_id": "sponge_abc123" }
```

### `POST /prompt` (`routes/prompt.py`)

Forwards user prompt to Gemini API with conversation history. Returns AI response.

```json
// Request
{
  "session_id": "sponge_abc123",
  "prompt_text": "How does the worker pick up jobs?",
  "conversation_history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}

// Response
{ "response_text": "Looking at rq/worker.py..." }
```

The Gemini client lives in `gemini/client.py`. It should:
- Take a system prompt that gives the AI context about RQ and the task
- Forward the conversation history
- Return the response text

### `POST /session/event` (`routes/session.py`)

Logs a frontend event. These events are used later by the scoring engine.

```json
// Request
{
  "session_id": "sponge_abc123",
  "event": "file_open",
  "file": "rq/worker.py",
  "ts": 1709234567890
}

// Response — empty, 200 OK
```

Event types the frontend sends:
- `file_open` — user opened a file in the editor
- `file_edit` — user edited a file
- `prompt_sent` — user sent a prompt to AI
- `test_run` — user ran tests

Store all events in the session object. The scoring engine reads them later.

### `POST /submit` (`routes/submit.py`)

Submits session for scoring. Fires three concurrent evaluations then runs `compute_score()`:
1. `evaluate_conversation()` — semantic eval of conversation via Gemini (12 sub-criteria)
2. `analyze_final_code()` — code quality analysis via Gemini (B1/B2/B3 + P3)
3. `run_correctness_tests()` — 12 synthesized tests in sandbox

All three return `None` on failure — the engine falls back to metric-based scoring.

```json
// Request
{
  "session_id": "sponge_abc123",
  "final_code": "// all file contents concatenated",
  "username": "alice"
}

// Response (response_model=Score)
{
  "total_score": 72,
  "breakdown": { "request_timing": 8, "request_quality": 9, "response_handling": 7, "verification_discipline": 5, "iterative_collaboration": 8, "penalties": -2 },
  "rubric_breakdown": { "problem_solving": 9.0, "code_quality": 10.0, "verification": 7.0, "communication": 11.0 },
  "headline_metrics": { "blind_adoption_rate": 0.15, "ai_modification_rate": 0.82, "test_after_ai_rate": 0.40, "passive_reprompt_rate": 0.10, "grounded_prompt_rate": 0.75, "evidence_grounded_followup_rate": 0.60, "ai_apply_without_edit_rate": 0.10, "test_pass_rate": 0.75 },
  "interpretation": "You scored 72/100. Check the insights below for specific feedback.",
  "badge": "On Your Way",
  "insights": [
    { "category": "Communication", "type": "strength", "title": "Grounded prompts", "description": "75% of your prompts referenced specific files." },
    { "category": "Verification", "type": "improvement", "title": "Run tests more frequently", "description": "Running tests after each AI suggestion catches issues early." }
  ],
  "sub_criteria": { "a1_understanding": 4.5, "..." : "..." },
  "penalty_detail": { "p1_over_reliance": 0, "p2_no_run": 0, "p3_critical_miss": -10 },
  "test_suite": { "total": 12, "passed": 9, "failed": 3, "pass_rate": 0.75, "results": [], "core_failures": [] }
}
```

`rubric_breakdown`, `sub_criteria`, `penalty_detail`, `test_suite`, `insights` are optional (null if eval failed).

### `POST /run-tests` (`routes/run_tests.py`)

Runs the correctness test suite against the user's current code. Returns pass/fail results.

```json
// Request
{ "session_id": "sponge_abc123", "file_contents": { "rq/queue.py": "..." } }

// Response
{
  "total": 12, "passed": 1, "failed": 11, "pass_rate": 0.08,
  "core_failures": ["test_enqueue_in_exists"],
  "results": [{ "test_name": "test_enqueue_in_exists", "passed": false, "is_core": true, "error_message": "..." }]
}
```

### `GET /leaderboard` (`routes/leaderboard.py`)

Returns all completed sessions sorted by score.

```json
// Response
[
  { "username": "zidan", "score": 85, "time_completed": "2024-03-01T12:34:56Z", "badge": "AI Collaborator" }
]
```

## Data Models (`models/`)

### Session (`models/session.py`)
```python
{
    "session_id": str,
    "started_at": datetime,
    "events": [Event],
    "conversation_history": [{"role": str, "content": str}],
    "final_code": str | None,
    "score": Score | None,
    "username": str | None
}
```

### Event (`models/event.py`)
```python
{
    "session_id": str,
    "event": str,       # "file_open", "file_edit", "prompt_sent", "test_run"
    "file": str | None,
    "ts": int           # Unix timestamp in milliseconds
}
```

### Score (`models/score.py`)
```python
Score(
    total_score: int,                           # 0-100
    breakdown: ScoreBreakdown,                  # legacy 0-10 metric scores
    headline_metrics: HeadlineMetrics,           # 8 rate metrics
    interpretation: str,                         # Brief summary text
    badge: str,                                  # "AI Collaborator" | "On Your Way" | "Needs Work" | "Just Vibing"
    rubric_breakdown: Optional[RubricBreakdown], # A:0-12, B:0-13, C:0-12, D:0-13
    sub_criteria: Optional[SubCriteriaDetail],   # 16 sub-criteria detail
    penalty_detail: Optional[PenaltyDetail],     # P1/P2/P3
    test_suite: Optional[TestSuiteResult],       # correctness test results
    insights: Optional[list[Insight]],           # Gemini-powered personalised insights
)

Insight(category, type, title, description)  # type: "strength" | "improvement"

RubricBreakdown(problem_solving, code_quality, verification, communication)
SubCriteriaDetail(a1_understanding, a2_decomposition, a3_justification, a4_edge_cases,
                  b1_clarity, b2_correctness, b3_efficiency, b4_ownership,
                  c1_exec_frequency, c2_test_coverage, c3_ai_validation, c4_debug_discipline,
                  d1_narration, d2_tradeoffs, d3_ai_balance, d4_status_summaries)
PenaltyDetail(p1_over_reliance, p2_no_run, p3_critical_miss)
TestSuiteResult(total, passed, failed, pass_rate, results: list[TestResult], core_failures: list[str])
```

## Scoring Engine (`scoring/`)

The scoring engine is fully implemented. Key files:

| File | Purpose |
|------|---------|
| `scoring/engine.py` | Main `compute_score()` — orchestrates all scoring, produces the `Score` model |
| `scoring/semantic.py` | `evaluate_conversation()` — Gemini-based semantic eval of 12 sub-criteria |
| `scoring/code_analysis.py` | `analyze_final_code()` — Gemini-based code quality eval (B1/B2/B3 + P3) |
| `scoring/test_runner.py` | `run_correctness_tests()` — runs 12 synthesized tests against user code |
| `scoring/metrics.py` | Metric computation from event log (rates, timing) |
| `scoring/insights.py` | `generate_insights()` — Gemini-powered personalised insights (strengths + improvements) |
| `scoring/vocabulary.py` | Badge assignment from total score |

The engine uses three evaluation sources (all fired concurrently, all fallback to `None`):
1. Conversation semantic eval → 12 sub-criteria scores (A1-A4, C1-C4, D1-D4)
2. Code analysis → B1-B3 scores + P3 penalty
3. Correctness tests → test pass rate → C2 score + P2 penalty

`compute_score()` merges these with event-log metrics to produce the final `Score`.

## Gemini Integration (`gemini/client.py`)

The Gemini client wraps the Google Generative AI API. It should:

1. Accept a system prompt (context about RQ, the task, guidelines for the AI assistant)
2. Accept conversation history
3. Return the AI response text
4. Handle errors gracefully

The API key should come from an environment variable: `GEMINI_API_KEY`.

## Session Storage

For the hackathon, use an in-memory dict. No database needed.

```python
sessions: dict[str, Session] = {}
```

## CORS

The frontend runs on `localhost:5173` (Vite default). Enable CORS for that origin.

## Running

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Server runs on `http://localhost:8000`.

## Context Sync Reminder

After every big change (new endpoint, changed request/response shape, new model field, renamed route file, modified scoring categories), update this file. See `AGENTS.md > Context Sync Protocol` for the full rules. If your change would break or confuse another team member's Claude Code agent, document it here before committing.
