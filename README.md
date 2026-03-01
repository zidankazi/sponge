<div align="center">
  <img src="frontend/public/brand/logo-full.png" width="100%" alt="Sponge — AI-Assisted System Design Interviews" />
</div>

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

<div align="center">
  <em> Master the AI-native Workflow. 🧽🫧</em>
</div>

<br/>

<div align="center">

[![Live Demo](https://img.shields.io/badge/▶%20Live%20Demo-sponge--alpha.vercel.app-6C47FF?style=for-the-badge)](https://sponge-alpha.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-zidankazi%2Fsponge-181717?style=for-the-badge&logo=github)](https://github.com/zidankazi/sponge)

</div>

<div align="center">

![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Monaco](https://img.shields.io/badge/Monaco_Editor-0078D4?style=for-the-badge&logo=visual-studio-code&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic_v2-E92063?style=for-the-badge&logo=pydantic&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

</div>

---

![AI-powered development](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fab5167a53ff0de956bd500b01b30d8aba028d843-4584x2580.png&w=3840&q=75)

> *How you use AI matters more than whether you use it [(Anthropic)](https://www.anthropic.com/research/AI-assistance-coding-skills) .*

## What is Sponge?

With the rise of agentic development, the bottleneck is no longer syntax — it's **judgment**. Research shows a striking paradox: AI assistance barely moves the needle on speed, but significantly degrades knowledge retention in engineers who use it passively. The ones who grow are using AI through conceptual inquiry and generation-then-comprehension — not delegation, not blind iteration.

The interaction modes that build real skill look a lot less like autocomplete and a lot more like system design. **Sponge measures something no LeetCode problem ever has: how well you actually use AI as a coding partner.**

You're dropped into a real open-source Python codebase **([RQ](https://github.com/rq/rq))**, given a feature to build, and a Gemini-powered AI assistant to collaborate with. When time's up, our scoring engine evaluates your entire session — not whether the code compiles, but whether you **understood, directed, verified, and owned** what the AI produced.

> Most AI coding tools make you faster. Sponge makes you *better*.
---

## How It Works

```
  📋  READ THE BRIEF          💬  CODE WITH AI           🏆  GET YOUR SCORE
  ─────────────────          ────────────────           ──────────────────
  A real open-source    →    Chat with Gemini,    →    60-second scoring
  Python codebase.           edit files in a            across 4 rubric
  60 minutes. One            VS Code-style IDE.         dimensions. Earn
  feature to ship.           Every move tracked.        your badge.
```

---

## 💻 Session — Editor + AI Chat
*VS Code-style editor with live AI assistant, file tree, and countdown timer*

<!-- TODO: replace src with screenshots/session.png -->
<img src="https://placehold.co/1280x760/0f0f13/6C47FF?text=Session+%E2%80%94+Editor+%2B+AI+Chat" alt="Sponge — Session View" width="100%" />

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          INTERVIEW REQUEST                               │
│              User submits username · session begins                      │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  SESSION PROVIDER  (Orchestration Layer)                 │
│                  useSession hook · React Context · in-memory store       │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                         QUERY HYDRATION                          │    │
│  │                                                                  │    │
│  │  ┌───────────────────────────┐  ┌─────────────────────────────┐  │    │
│  │  │   User Action Sequence    │  │       User Features         │  │    │
│  │  │   (event history)         │  │  username · active_file     │  │    │
│  │  │                           │  │  conversation_history       │  │    │
│  │  │  file_open · file_edit    │  │  file_contents (buffers)    │  │    │
│  │  │  prompt_sent · test_run   │  │                             │  │    │
│  │  └───────────────────────────┘  └─────────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           CANDIDATE SOURCES                              │
│                                                                          │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │      AIDE ENGINE         │  │       CODEBASE RETRIEVAL             │  │
│  │  (Gemini 2.5 Flash)      │  │       (rq-v1.0  Reference)           │  │
│  │                          │  │                                      │  │
│  │  Grounded AI responses   │  │  Active file + full file buffers     │  │
│  │  aware of your edits &   │  │  injected as context window —        │  │
│  │  conversation history    │  │  ML-similarity over real source      │  │
│  └──────────────────────────┘  └──────────────────────────────────────┘  │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                               HYDRATION                                  │
│   POST /prompt — active_file · file_contents · conversation_history      │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                               FILTERING                                  │
│   Remove: empty events · invalid sessions · malformed requests           │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                SCORING                                   │
│                                                                          │
│  ┌───────────────────────┐                                               │
│  │   Semantic Scorer     │  Gemini evaluates 12 conversation dimensions  │
│  │   (ML Predictions)    │  P(understanding) · P(ownership)              │
│  │                       │  P(testing) · P(tradeoffs) · P(narration)...  │
│  └───────────┬───────────┘                                               │
│              │                                                           │
│              ▼                                                           │
│  ┌───────────────────────┐                                               │
│  │    Rubric Scorer      │  Weighted Score = Σ ( weight × P(dimension) ) │
│  │  (Combine Predictions)│                                               │
│  │                       │  A  Problem Solving    (0 – 25)               │
│  └───────────┬───────────┘  B  Code Quality       (0 – 25)               │
│              │              C  Verification        (0 – 25)              │
│              ▼              D  Communication       (0 – 25)              │
│  ┌───────────────────────┐                                               │
│  │  Code + Test Scorer   │  Attenuate blind AI adoption (P3 penalty)     │
│  │  (Verification Gate)  │  Correctness tests via isolated pytest runner │
│  └───────────────────────┘                                               │
│                                                                          │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                               SELECTION                                  │
│         compute_score() → total 0 – 100 · assign badge tier              │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        FILTERING  (Post-Scoring)                         │
│         interpretation.py — narrative feedback · badge assignment        │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                             SCORE RESPONSE                               │
│         Score model → ScoreReveal.jsx · badge · interpretation           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### 🖥 Frontend
| | Library | Purpose |
|---|---|---|
| <img src="https://cdn.simpleicons.org/react/61DAFB" width="18"/> | **React 18** | UI framework |
| <img src="https://cdn.simpleicons.org/vite/646CFF" width="18"/> | **Vite 5** | Build tool & dev server |
| <img src="https://cdn.simpleicons.org/visualstudiocode/0078D4" width="18"/> | **Monaco Editor** | In-browser VS Code-style IDE |
| <img src="https://cdn.simpleicons.org/reactrouter/CA4245" width="18"/> | **React Router v7** | Client-side routing |

### ⚙️ Backend
| | Library | Purpose |
|---|---|---|
| <img src="https://cdn.simpleicons.org/python/3776AB" width="18"/> | **Python 3.11** | Runtime |
| <img src="https://cdn.simpleicons.org/fastapi/009688" width="18"/> | **FastAPI** | REST API framework |
| <img src="https://cdn.simpleicons.org/pydantic/E92063" width="18"/> | **Pydantic v2** | Data validation & schemas |
| <img src="https://icons.veryicon.com/png/o/miscellaneous/gwidc_1/redis.png" width="18"/> | **fakeredis** | Environment containerization |
| <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ18M1yPSLd5dvjC6BhTzqkEO2oIuPOaU5yeQ&s" width="18"/> | **Pytest** | Code testing |
| <img src="https://cdn.simpleicons.org/python/3776AB" width="18"/> | **python-dotenv** | Environment config |

### 🤖 AI
| | Library | Purpose |
|---|---|---|
| <img src="https://cdn.simpleicons.org/google/4285F4" width="18"/> | **google-genai** | Gemini 2.5 Flash — AIDE chat + semantic scoring |

### ☁️ Infrastructure
| | Tool | Purpose |
|---|---|---|
| <img src="https://cdn.simpleicons.org/vercel/000000" width="18"/> | **Vercel** | Frontend + Backend hosting |

---

## Scoring Rubric

Every session is scored across **4 rubric categories** (0–25 each), powered by a 3-layer evaluation pipeline running concurrently:

| # | Dimension | What We Measure | Max |
|---|-----------|----------------|-----|
| **A** | 🧩 **Problem Solving** | Did you understand the task, decompose it clearly, and justify your approach? | 25 |
| **B** | 💻 **Code Quality** | Is the implementation correct, efficient, and idiomatic? | 25 |
| **C** | ✅ **Verification** | Did you test your code, run it, and catch edge cases before moving on? | 25 |
| **D** | 💬 **Communication** | Did you narrate intent, discuss tradeoffs, and ask grounded follow-up questions? | 25 |

**Penalties** are applied for blind copy-paste (P3), no test runs (P2), and over-reliance on AI (P1).

**Badges:** `Novice` → `On Your Way` → `AI Collaborator` → `Expert`

---

## Project Structure

```
sponge/
├── frontend/                   React + Vite
│   ├── public/
│   │   ├── brand/              Logos, favicons, PWA manifest
│   │   └── logos/              Sponsor & AI tool logos
│   └── src/
│       ├── components/
│       │   ├── editor/         FileTree, CodeEditor, ProblemStatement
│       │   ├── chat/           ChatTerminal, ChatMessage
│       │   ├── game/           LandingScreen, BriefScreen, ResultsScreen, ScoreReveal
│       │   └── shared/         Header, Layout
│       ├── hooks/              useSession, useResizable
│       ├── api/                client.js — fetch wrapper with mock flags
│       └── data/               fileTree.js, fileContents.js (RQ source)
│
├── backend/                    FastAPI + Python
│   ├── routes/                 session, prompt, submit, leaderboard
│   ├── scoring/                engine, semantic, code_analysis, test_runner,
│   │                           metrics, interpretation, vocabulary
│   ├── models/                 Session, Event, Score (Pydantic v2)
│   ├── gemini/                 client, config, fallback, system_prompt
│   └── store.py                In-memory session store
│
└── rq-v1.0/                    Reference codebase users work in (read-only)
```

---

## Setup & Installation

### Prerequisites
- Node.js ≥ 18
- Python ≥ 3.11
- A [Google AI Studio](https://aistudio.google.com/) API key

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:
```env
GEMINI_API_KEY=your_key_here
```

```bash
uvicorn main:app --reload
# → http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
VITE_API_URL=http://localhost:8000
```

```bash
npm run dev
# → http://localhost:5173
```

---

## API Reference

<details>
<summary><strong>View all endpoints</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/session/start` | Create a new session → `{ session_id }` |
| `POST` | `/session/event` | Log a frontend event (fire-and-forget) |
| `POST` | `/prompt` | Send prompt to Gemini AIDE → `{ response_text }` |
| `POST` | `/submit` | Close session, run scoring → full `Score` model |
| `GET` | `/leaderboard` | Fetch all completed sessions sorted by score |

**POST `/prompt`** body:
```json
{
  "session_id": "sponge_abc123",
  "prompt_text": "How do I add a ScheduledJobRegistry?",
  "conversation_history": [...],
  "active_file": "rq/queue.py",
  "file_contents": { "rq/queue.py": "...", "rq/registry.py": "..." }
}
```

**POST `/submit`** returns:
```json
{
  "total_score": 78,
  "breakdown": { "problem_solving": 20, "code_quality": 18, "verification": 22, "communication": 21 },
  "headline_metrics": { "ai_apply_without_edit_rate": 0.12, "test_pass_rate": 0.83, ... },
  "interpretation": "Strong ownership of AI suggestions...",
  "badge": "AI Collaborator"
}
```

</details>

---

## Built With ❤️ at the QuackHacks '26 🐥

---

## Attribution

- **[RQ (Redis Queue)](https://github.com/rq/rq)** — open-source Python job queue library used as the interview codebase (`rq-v1.0/`)
- **[Gemini 2.5 Flash](https://deepmind.google/technologies/gemini/)** — Google DeepMind, used via `google-genai` SDK for AIDE chat and semantic scoring
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** — Microsoft, in-browser code editor
- **[FastAPI](https://fastapi.tiangolo.com/)** — Sebastián Ramírez, backend web framework
- **[Pydantic](https://docs.pydantic.dev/)** — Samuel Colvin, data validation
- **[Vite](https://vitejs.dev/)** — Evan You, frontend build tool
- **[React](https://react.dev/)** — Meta, UI framework
- **[Vercel](https://vercel.com/)** — hosting for both frontend and backend
