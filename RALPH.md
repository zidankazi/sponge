# Ralph Agent Loop

This is the autonomous build loop for Sponge. Paste the prompt below into a fresh Claude Code session to run it.

## Loop Prompt

```
Read AGENTS.md and FRONTEND_AGENTS.md for full project context. Then read progress.txt for accumulated learnings from previous iterations. Then read prd.json.

Find the first story where "status" is "pending". Implement it completely. The working directory is the repo root — all frontend work is in frontend/src/.

After implementing, run this exact command to validate:
  cd frontend && npm run build

The build must complete with 0 errors. If it fails, fix all errors and rebuild until it passes. Do not move on with a broken build.

Once the build passes:
1. Update prd.json — change the story's "status" from "pending" to "complete"
2. Append a brief entry to progress.txt describing what you did and any gotchas discovered
3. Commit all changed files with a clear message referencing the story ID (e.g. "[S-01] auto-submit on timer expiry")

Then move to the next pending story and repeat. Stop when all stories are complete or when you hit a genuine blocker you cannot resolve (in which case, document it in progress.txt).
```

## Current Story Status

| ID | Title | Status |
|----|-------|--------|
| S-01 | Auto-submit when timer expires | pending |
| S-02 | Username capture on landing screen | pending |
| S-03 | Debounce file_edit event logging | pending |
| S-04 | Fix missing ProblemStatement CSS classes | pending |
| S-05 | Username shown in user chat avatar | pending |

## Notes

- S-05 depends on S-02 (needs username in state). The loop will handle this in order.
- Run the loop on the `zidan/editor` branch.
- After the loop completes, review commits, then PR to main.
