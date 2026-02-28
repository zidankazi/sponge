# FRONTEND_AGENTS.md — Frontend Claude Code Context

Read `AGENTS.md` first for full project context. This file is frontend-specific.

## Component Ownership

Two people work on the frontend. They do NOT touch each other's components.

### Zidan — Core Product (`components/editor/`, `components/chat/`)

| Component | Purpose |
|-----------|---------|
| `editor/FileTree.jsx` | File explorer sidebar — renders the RQ file tree, handles open/close |
| `editor/CodeEditor.jsx` | Monaco editor — syntax highlighting, file tabs, edit tracking |
| `editor/ProblemStatement.jsx` | Problem description shown above the file tree |
| `chat/ChatTerminal.jsx` | AI chat panel — message list, input bar, typing indicator |
| `chat/ChatMessage.jsx` | Single chat message renderer (markdown, code blocks, inline code) |

Also owns: `pages/SessionPage.jsx`, `hooks/useSession.jsx`, `hooks/useTimer.js`, `api/client.js`, `components/game/LandingScreen.jsx`

> **Note on LandingScreen:** it lives in `components/game/` but is owned by **Zidan**, not Josh. It's session flow (start screen, username input), not game UI. Josh does not touch it.

### Designer — Game Layer (`components/game/`, except LandingScreen)

| Component | Purpose |
|-----------|---------|
| `game/ResultsScreen.jsx` | Post-session score reveal — score circle, breakdown bars, metrics |
| `game/ScoreReveal.jsx` | Animated score reveal sequence (number count-up, badge reveal) |
| `game/Leaderboard.jsx` | Leaderboard table with rankings, scores, badges |
| `game/Badge.jsx` | Badge component — icon + label for each badge tier |

Also owns: `pages/LeaderboardPage.jsx`

### Shared (`components/shared/`)

Both can use and modify these:

| Component | Purpose |
|-----------|---------|
| `shared/Button.jsx` | Reusable button with variants (primary, secondary, ghost) |
| `shared/Timer.jsx` | Countdown timer display used in the header |

## File Structure

```
frontend/src/
  components/
    editor/
      FileTree.jsx
      CodeEditor.jsx
      ProblemStatement.jsx
    chat/
      ChatTerminal.jsx
      ChatMessage.jsx
    game/
      ResultsScreen.jsx
      ScoreReveal.jsx
      Leaderboard.jsx
      Badge.jsx
    shared/
      Button.jsx
      Timer.jsx
  pages/
    SessionPage.jsx
    LeaderboardPage.jsx
  api/
    client.js
  hooks/
    useSession.jsx
    useTimer.js
  data/
    fileTree.js
    fileContents.js
  App.jsx
  main.jsx
  index.css
```

## API Client (`api/client.js`)

All API calls go through `api/client.js`. Currently mocked — each function returns hardcoded data with a simulated delay. When the backend is ready, swap the mock implementations for real `fetch` calls. The function signatures match the API contract exactly:

```js
startSession()                    // POST /session/start
sendPrompt({ session_id, prompt_text, conversation_history })  // POST /prompt
logEvent({ session_id, event, file, ts })                      // POST /session/event
submitSession({ session_id, final_code })                      // POST /submit
fetchLeaderboard()                // GET /leaderboard
```

## Mock API Responses

### `POST /prompt` — mock responses

The mock rotates through canned responses based on keywords in the prompt:
- Keywords `schedule`, `delay`, `enqueue_in`, `enqueue_at` → response about the scheduling approach
- Keywords `worker`, `perform`, `execute` → response about the worker execution flow
- Keywords `queue`, `enqueue` → response about Queue class structure
- Keywords `test` → response about testing the implementation
- Default → general overview response

### `POST /submit` — mock response

```json
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

### `GET /leaderboard` — mock response

```json
[
  { "username": "zidan", "score": 85, "time_completed": "2024-03-01T12:34:56Z", "badge": "AI Collaborator" },
  { "username": "alice", "score": 72, "time_completed": "2024-03-01T13:00:00Z", "badge": "On Your Way" },
  { "username": "bob", "score": 58, "time_completed": "2024-03-01T14:30:00Z", "badge": "Needs Work" }
]
```

## Design System (CSS Custom Properties)

All colors and sizes are defined in `index.css` as CSS custom properties. Use these — do not hardcode colors.

```css
/* Backgrounds */
--bg-root: #0a0c0b
--bg-surface: #111413
--bg-surface-2: #191d1b
--bg-surface-3: #1e2321
--bg-hover: #242a27

/* Borders */
--border: #2a2f2c
--border-subtle: #1e2321

/* Forest green accent */
--green-dark: #2d6a4f
--green: #40916c
--green-light: #52b788
--green-lighter: #74c69d
--green-faint: rgba(64, 145, 108, 0.08)

/* Cream text */
--cream: #f5f0e8
--cream-dim: #b8b0a4

/* Text hierarchy */
--text: #e0ddd7         /* body text */
--text-secondary: #9a958e  /* secondary */
--text-dim: #6b665f      /* labels, hints */

/* Status colors */
--red: #e05555
--yellow: #e0b555
--blue: #5588cc

/* Fonts */
Body: 'Inter', -apple-system, sans-serif
Code: 'JetBrains Mono', 'Fira Code', monospace
```

## RQ File Tree (hardcoded in `data/fileTree.js`)

The file tree shown in the sidebar. All `rq/` source files are accessible (have content in `fileContents.js`). Test files are visible in the tree but NOT accessible (no content loaded — they appear grayed out). This is intentional: we don't want users reverse-engineering the test suite.

```
rq/
  __init__.py
  cli/
    __init__.py
    cli.py
    helpers.py
  compat/
    __init__.py
    connections.py
    dictconfig.py
  connections.py
  contrib/
    __init__.py
    legacy.py
    sentry.py
  decorators.py
  defaults.py
  dummy.py
  exceptions.py
  job.py          ← key file
  local.py
  logutils.py
  queue.py        ← key file
  registry.py     ← key file
  suspension.py
  timeouts.py
  utils.py
  version.py
  worker.py       ← key file
  worker_registration.py
tests/            ← visible but NOT accessible
  __init__.py
  fixtures.py
  test_cli.py
  test_connection.py
  test_decorator.py
  test_helpers.py
  test_job.py
  test_queue.py
  test_registry.py
  test_sentry.py
  test_utils.py
  test_worker.py
  test_worker_registration.py
docs/
examples/
README.md
requirements.txt
setup.py
```

## State Management

All session state lives in `hooks/useSession.jsx` via React Context:

- `sessionId` — current session ID from backend
- `view` — `'idle'` | `'session'` | `'results'`
- `timeLeft` / `totalTime` — countdown timer (60 min)
- `activeFile` / `openFiles` — editor file state
- `fileBuffers` — in-memory file contents (initialized from `fileContents.js`)
- `chatHistory` — array of `{ role, content }` messages
- `isAiLoading` — whether AI is generating a response
- `results` — scoring results from submit endpoint
- `isSubmitting` — loading state for submit

## Key Implementation Notes

- Monaco Editor is used for the code editor (`@monaco-editor/react`)
- Custom Monaco theme `sponge-dark` matches the design system
- File contents are hardcoded in `data/fileContents.js` — the editor is read/write but changes only live in memory
- The chat panel renders markdown (code blocks, inline code, bold, bullets) with a custom renderer
- Events are logged to the backend via `logEvent()` for scoring analysis

## Context Sync Reminder

After every big change (new component, renamed file, changed hook signature, new CSS vars, modified mock data), update this file. See `AGENTS.md > Context Sync Protocol` for the full rules. If your change would break or confuse another team member's Claude Code agent, document it here before committing.
