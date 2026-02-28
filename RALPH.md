# Ralph Agent Loop — josh/game branch

## Loop Prompt

```
Read AGENTS.md and FRONTEND_AGENTS.md for full project context. Then read progress.txt for architecture notes and gotchas. Then read prd.json.

Find the first story where "status" is "pending". Implement it completely. All work is in frontend/src/.

RULES (non-negotiable):
1. Only modify files listed in the story's "files" array. If you need to touch an unlisted file, log it as a blocker in progress.txt and stop.
2. When editing index.css, ONLY append new rules at the very end. Never modify or reorder existing rules.
3. Do NOT touch: App.jsx, hooks/useSession.jsx, api/client.js, components/editor/*, components/chat/*
4. Do not install any new npm packages.
5. No animations yet — framework and structure only. Stories marked "no animation" mean it.

Validate with:
  cd frontend && npm run build

Must produce 0 errors. Fix and retry until it does. Do not move on with a broken build.

Once the build passes:
1. Set the story's "status" to "complete" in prd.json
2. Append one entry to progress.txt: [G-XX] what changed, any gotchas
3. git add only the story's files + prd.json + progress.txt, then commit: "[G-XX] short description"

Move to next pending story and repeat. Stop when all stories are complete or on an unresolvable blocker.
```

## Story Status

| ID | Title | Status |
|----|-------|--------|
| G-01 | Badge component | pending |
| G-02 | Wire Badge into ResultsScreen | pending |
| G-03 | Leaderboard component | pending |
| G-04 | LeaderboardPage — header, loading, empty state | pending |
| G-05 | ScoreReveal skeleton | pending |
| G-06 | Wire ScoreReveal + Leaderboard into ResultsScreen | pending |
