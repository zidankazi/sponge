# Sponge

Gamified AI-assisted coding interview practice. Users drop into a real Python codebase (RQ v1.0), collaborate with an AI assistant to add delayed job execution, and get scored on correctness **and** collaboration quality.

## Scoring (0-100)

| Component | Points | What it measures |
|-----------|--------|------------------|
| **T. Test Accuracy** | **0-50** | Pass rate across 20 tests (12 visible + 8 hidden) |
| A. Problem Solving | 0-12 | Understanding, planning, justification, edge cases |
| B. Code Quality | 0-13 | Clarity, efficiency, AI code ownership |
| C. Verification | 0-12 | How often they ran tests, debug discipline |
| D. Communication | 0-13 | Narration, tradeoffs, AI collaboration balance |
| Penalties | −13 max | AI over-reliance (−8), never ran tests (−5) |

Test accuracy is **50% of the grade**. The other 50% measures how the candidate collaborates with AI.

## Quick Start

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`.

### Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on `http://localhost:8000`.

Create a `.env` file in `backend/` with:
```
GEMINI_API_KEY=your_key_here
```

## Team & Branches

| Person | Domain | Branch |
|--------|--------|--------|
| Zidan | Core frontend — editor, file tree, AI chat, session flow | `zidan/editor` |
| Designer | Game layer — results, leaderboard, score reveal, badges | `designer/game` |
| Backend | FastAPI — Gemini API, scoring, session storage, leaderboard | `backend/core` |

- `main` — stable, demo-ready only. PRs to main when fully working.
- Work on your branch, push often, PR when ready.

## Claude Code Setup

Every team member uses Claude Code. Before working:

1. Claude reads `AGENTS.md` first (full project context)
2. Then reads `FRONTEND_AGENTS.md` or `BACKEND_AGENTS.md` for your domain
3. After every big change, update the relevant AGENTS doc so everyone stays in sync

## Project Structure

```
sponge/
  frontend/           React + Vite
    src/
      components/
        editor/       FileTree, CodeEditor, ProblemStatement
        chat/         ChatTerminal, ChatMessage
        game/         LandingScreen, ResultsScreen, ScoreReveal, Leaderboard, Badge
        shared/       Header, Layout, Button, Timer
      pages/          SessionPage, LeaderboardPage
      hooks/          useSession, useTimer
      api/            client.js (mocked, swap for real fetch when backend is ready)
      data/           fileTree.js, fileContents.js (RQ source files)
  backend/            FastAPI + Python
    routes/           session, prompt, submit, leaderboard
    scoring/          scoring engine (backend partner's domain)
    models/           session, event, score
    gemini/           Gemini API client
  rq-v1.0/            The codebase users work in (DO NOT MODIFY)
  AGENTS.md           Project context for Claude Code
  FRONTEND_AGENTS.md  Frontend context
  BACKEND_AGENTS.md   Backend context
```
