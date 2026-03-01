# AGENTS.md — Sponge Project Context

Read this file first. It tells you everything you need to know about the project.

## What is Sponge?

Sponge is a gamified AI-assisted coding interview practice platform, built for the Gaming track at a hackathon. Think LeetCode meets a game — users drop into a real codebase, collaborate with an AI assistant to build a feature, and get scored on how well they used AI, not whether the code works. Leaderboard, badges, score reveal, the whole thing.

The pitch: we've gamified the coding interview prep experience. Score system, leaderboard, progression, competitive.

## The Interview Task

Users are dropped into a real Python job queue library (RQ — Redis Queue). The task:

> **Add Delayed Job Execution** — extend RQ so jobs can be scheduled to run at a specific time in the future. Add `enqueue_in(seconds, func, *args, **kwargs)` and `enqueue_at(datetime, func, *args, **kwargs)` to the Queue class. A job scheduled for time T must not execute before T. A job scheduled in the past should run immediately. All existing behavior must continue to work.

The codebase lives at `rq-v1.0/` in the repo root. Do not modify it.

## Stack

- **Frontend**: React + Vite (no Tailwind yet — using vanilla CSS with CSS custom properties)
- **Backend**: FastAPI + Python
- **AI**: Gemini API

## Team & Ownership

| Person | Domain | Branch |
|--------|--------|--------|
| Zidan | Core product frontend — editor, file tree, AI chat, session flow | `zidan/editor` |
| Josh | Game layer frontend — results screen, leaderboard, score reveal, badges | `josh/game` |
| Sri partner | FastAPI backend — Gemini API, scoring, session storage, leaderboard | `Sri/core` |

**Branch strategy:**
- `main` — stable, demo-ready only. PRs to main when something is fully working.
- `zidan/editor` — Zidan's working branch
- `josh/game` — Josh's working branch
- `Sri/core` — Sri's working branch

## API Contract

This is the shared interface between frontend and backend. Both sides implement to this spec.

### `POST /session/start`
Starts a new interview session.
```json
// Response
{ "session_id": "sponge_abc123" }
```

### `POST /prompt`
Sends a user prompt to the AI assistant with codebase context.
```json
// Request
{
  "session_id": "sponge_abc123",
  "prompt_text": "How does the worker pick up jobs?",
  "conversation_history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "active_file": "rq/worker.py",
  "file_contents": { "rq/worker.py": "...", "rq/queue.py": "..." }
}

// Response
{ "response_text": "Looking at rq/worker.py..." }
```

### `POST /session/event`
Logs a frontend event for scoring analysis. Fire-and-forget.
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

Event types: `file_open`, `file_edit`, `prompt_sent`, `test_run`

### `POST /run-tests`
Runs the correctness test suite against the user's current code.
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

### `POST /submit`
Submits the session for scoring. Fires three concurrent evaluations (semantic, code analysis, correctness tests) then runs the scoring engine.
```json
// Request
{
  "session_id": "sponge_abc123",
  "final_code": "// all file contents concatenated",
  "username": "alice"
}

// Response
{
  "total_score": 72,
  "breakdown": {
    "request_timing": 8,
    "request_quality": 9,
    "response_handling": 7,
    "verification_discipline": 5,
    "iterative_collaboration": 8,
    "penalties": -2
  },
  "rubric_breakdown": {
    "problem_solving": 9.0,
    "code_quality": 10.0,
    "verification": 7.0,
    "communication": 11.0
  },
  "headline_metrics": {
    "blind_adoption_rate": 0.15,
    "ai_modification_rate": 0.82,
    "test_after_ai_rate": 0.40,
    "passive_reprompt_rate": 0.10,
    "grounded_prompt_rate": 0.75,
    "evidence_grounded_followup_rate": 0.60,
    "ai_apply_without_edit_rate": 0.10,
    "test_pass_rate": 0.75
  },
  "interpretation": "Strong collaborative instincts...",
  "badge": "On Your Way",
  "sub_criteria": { "a1_understanding": 4.5, "...": "..." },
  "penalty_detail": { "p1_over_reliance": 0, "p2_no_run": 0, "p3_critical_miss": -10 },
  "test_suite": { "total": 12, "passed": 9, "failed": 3, "pass_rate": 0.75, "results": [], "core_failures": [] }
}
```

**Note:** `rubric_breakdown`, `sub_criteria`, `penalty_detail`, and `test_suite` are optional and may be null if the corresponding eval failed.

### `GET /leaderboard`
Returns the leaderboard.
```json
// Response
[
  { "username": "zidan", "score": 85, "time_completed": "2024-03-01T12:34:56Z", "badge": "AI Collaborator" },
  { "username": "alice", "score": 72, "time_completed": "2024-03-01T13:00:00Z", "badge": "On Your Way" }
]
```

## Scoring System (0-100 final score)

The scoring engine produces two layers:

### Legacy breakdown (0-10 per category, metric-based)
1. **Request Timing** (0-10) — Did they engage with the problem before prompting AI?
2. **Request Quality** (0-10) — Were prompts specific, contextual, bounded?
3. **Response Handling** (0-10) — Did they modify AI code or blindly paste it?
4. **Verification Discipline** (0-10) — Did they run tests after AI output?
5. **Iterative Collaboration** (0-10) — Did they work in prompt > action > result loops?
6. **Penalties** (0 to -10) — Blind AI adoption, never running tests

### Rubric breakdown (the real scores displayed to users)
Four categories with 16 sub-criteria, scored via Gemini semantic eval + code analysis + correctness tests:
- **A: Problem Solving** (0-12) — understanding, decomposition, justification, edge cases
- **B: Code Quality** (0-13) — clarity, correctness, efficiency, ownership
- **C: Verification** (0-12) — exec frequency, test coverage, AI validation, debug discipline
- **D: Communication** (0-13) — narration, tradeoffs, AI balance, status summaries

### Penalties (applied after rubric)
- **P1 Over-reliance** (0, -5, -10, or -15)
- **P2 No run** (0 or -10) — never ran tests
- **P3 Critical miss** (0 or -10) — missed critical test failures

`total_score` = sum of rubric categories + penalties, clamped to 0-100.

## Badges

| Score Range | Badge |
|-------------|-------|
| 85-100 | AI Collaborator |
| 70-84 | On Your Way |
| 50-69 | Needs Work |
| 0-49 | Just Vibing |

## Design System

- **Background**: Near-black (`#0a0c0b` root, `#111413` surfaces)
- **Accent**: Forest green (`#2d6a4f` dark, `#40916c` mid, `#52b788` light)
- **Text**: Cream (`#f5f0e8` bright, `#e0ddd7` body, `#9a958e` secondary)
- **Borders**: `#2a2f2c`
- **Fonts**: Inter for UI, JetBrains Mono for code
- **Vibe**: Feels like a game, not a SaaS tool. No purple gradients. No neon. No AI product aesthetic.

## Repo Structure

```
sponge/
  frontend/          ← React + Vite
  backend/           ← FastAPI + Python
  rq-v1.0/           ← The codebase users work in (DO NOT MODIFY)
  README.md
  AGENTS.md          ← This file
  FRONTEND_AGENTS.md ← Frontend-specific context
  BACKEND_AGENTS.md  ← Backend-specific context
```

## Context Sync Protocol

Every team member uses Claude Code. After every **big change** (new feature, structural refactor, API change, new component, deleted files, renamed files, changed data shapes), you MUST update the relevant AGENTS docs so everyone's agent stays in sync.

### What counts as a big change?
- Adding, removing, or renaming a file or component
- Changing an API endpoint signature, request/response shape, or route
- Adding or modifying shared state (context, hooks, stores)
- Changing the scoring model, badge tiers, or data models
- Modifying the design system (new CSS vars, new fonts, changed colors)
- Anything that would break another team member's code if they didn't know about it

### Which file to update?
| Change type | Update |
|------------|--------|
| API contract, scoring, badges, design system, team/branch info | `AGENTS.md` |
| Frontend components, hooks, pages, CSS vars, mock data | `FRONTEND_AGENTS.md` |
| Backend routes, models, Gemini config, storage | `BACKEND_AGENTS.md` |
| Affects both frontend and backend | All relevant files |

### How to update?
1. After finishing your change, open the relevant AGENTS doc
2. Update the affected section (file tree, component table, API spec, etc.)
3. If you added a new concept or file, add a new entry — don't leave it undocumented
4. If you removed something, remove it from the doc too
5. Commit the AGENTS doc update in the same commit as the code change

**Rule: if your change would surprise another team member's Claude Code agent, update the docs.**
