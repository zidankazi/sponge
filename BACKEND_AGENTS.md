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

Submits session for scoring. Runs the scoring engine on the event log and returns results.

```json
// Request
{
  "session_id": "sponge_abc123",
  "final_code": "// all file contents concatenated"
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
  "headline_metrics": {
    "blind_adoption_rate": 0.15,
    "ai_modification_rate": 0.82,
    "test_after_ai_rate": 0.40,
    "passive_reprompt_rate": 0.10,
    "grounded_prompt_rate": 0.75,
    "evidence_grounded_followup_rate": 0.60
  },
  "interpretation": "Strong collaborative instincts...",
  "badge": "On Your Way"
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
{
    "total_score": int,
    "breakdown": {
        "request_timing": int,
        "request_quality": int,
        "response_handling": int,
        "verification_discipline": int,
        "iterative_collaboration": int,
        "penalties": int
    },
    "headline_metrics": {
        "blind_adoption_rate": float,
        "ai_modification_rate": float,
        "test_after_ai_rate": float,
        "passive_reprompt_rate": float,
        "grounded_prompt_rate": float,
        "evidence_grounded_followup_rate": float
    },
    "interpretation": str,
    "badge": str
}
```

## Scoring Engine (`scoring/engine.py`)

**This is entirely the backend partner's domain.** The engine receives a session (with all events and conversation history) and returns a Score object.

The six scoring categories and their weights are defined in `AGENTS.md`. The implementation is up to the backend partner.

The `scoring/` directory is intentionally left empty — design it however you want.

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
