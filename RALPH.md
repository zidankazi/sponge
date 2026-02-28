# Ralph Agent Loop

Autonomous build loop for Sponge. Paste the prompt below into a fresh Claude Code session on the `zidan/editor` branch.

## Loop Prompt

```
Read AGENTS.md and FRONTEND_AGENTS.md for full project context. Then read progress.txt for accumulated learnings. Then read prd.json.

Find the first story where "status" is "pending". Implement it completely.

RULES (follow strictly):
1. Only modify files listed in the story's "files" array. If you think you need to change an unlisted file, stop and log it as a blocker in progress.txt instead.
2. When editing index.css, only APPEND new rules at the very end. Never modify or reorder existing rules.
3. Do not install any new npm packages.
4. Do not modify any file in components/game/ except LandingScreen.jsx (which is Zidan's, not Josh's).

Validate with:
  cd frontend && npm run build

Must produce 0 errors. Fix and retry until it does. Do not move on with a broken build.

Once the build passes:
1. Set the story's "status" to "complete" in prd.json
2. Append one entry to progress.txt: story ID, what changed, any gotchas
3. git add only the story's files + prd.json + progress.txt, then commit with message "[S-XX] short description"

Move to next pending story and repeat. Stop when all stories are complete or on an unresolvable blocker.
```

## Story Status

| ID | Title | Status |
|----|-------|--------|
| S-01 | Auto-submit when timer expires | pending |
| S-02 | Username capture on landing screen | pending |
| S-03 | Debounce file_edit event logging | pending |
| S-04 | Fix missing ProblemStatement CSS classes | pending |
| S-05 | Username initial in chat avatar (depends on S-02) | pending |

## Merge Safety

- All stories touch only Zidan's files (`hooks/`, `chat/`, `editor/`, `LandingScreen.jsx`, `api/client.js`)
- Josh works in `game/` (except LandingScreen) and `pages/LeaderboardPage.jsx` — no overlap
- `index.css` is shared but append-only rule prevents conflicts: Zidan appends, Josh appends, git merges cleanly as long as neither edits the same existing lines
- After loop completes, PR `zidan/editor` → `main`
