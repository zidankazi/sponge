# Meta-Style Deterministic Scoring Rubric (0–100)

This rubric operationalizes Meta’s four evaluation competencies—**Problem Solving**, **Code Quality**, **Verification**, and **Communication**—into **observable, behavior-anchored** scoring criteria with fixed point ranges and explicit penalties.

---

## Overview

**Category weights (equal):**
- Problem Solving: 0–25
- Code Quality: 0–25
- Verification: 0–25
- Communication: 0–25

**Final score:**
> **Final = clamp(A + B + C + D + penalties, 0, 100)**  
Where clamp caps the value to the range [0, 100].

**Determinism rule:**  
Only award points for **observable** behaviors: spoken explanation, explicit plan, executed tests, clear reasoning, and demonstrable understanding of AI output.

---

## Category A — Problem Solving (0–25)

Score based on what the candidate explicitly demonstrates.

### A1. Problem understanding + restatement (0–6)
- **0:** Doesn’t restate; misinterprets requirements.
- **2:** Restates partially; misses key constraint(s).
- **4:** Correct restatement + identifies inputs/outputs.
- **6:** Restatement + identifies constraints + success criteria.

### A2. Decomposition / plan (0–7)
- **0:** No plan; starts coding immediately.
- **3:** Some steps but vague.
- **5:** Clear steps with ordering.
- **7:** Clear steps + identifies dependencies and when they’ll verify.

### A3. Algorithm/approach justification (0–7)
- **0:** No justification / random approach.
- **3:** Names technique without rationale.
- **5:** Correct rationale (e.g., “BFS for shortest path on unweighted graph”).
- **7:** Rationale + alternative considered + tradeoff stated.

### A4. Edge cases identified before coding (0–5)
- **0:** None.
- **2:** Mentions 1 edge case.
- **4:** Mentions 2–3 meaningful edge cases.
- **5:** Mentions 3+ and ties them to tests or logic branches.

**Problem Solving Score:**  
> **A = A1 + A2 + A3 + A4** (max 25)

---

## Category B — Code Quality (0–25)

Measures cleanliness, maintainability, and ownership of AI-generated code.

### B1. Clarity/readability (naming, structure) (0–8)
- **0:** Hard to follow; messy; unclear names.
- **4:** Mostly readable; some confusing parts.
- **6:** Clean structure; good names.
- **8:** Very clean + modular + consistent.

### B2. Correctness-oriented design (invariants, data structures) (0–7)
- **0:** Data structures don’t match problem; logic tangled.
- **3:** Some alignment but awkward.
- **5:** Appropriate structures + mostly coherent flow.
- **7:** Strong alignment + maintains clear invariants.

### B3. Efficiency awareness (0–5)
- **0:** No complexity awareness; inefficient when avoidable.
- **2:** Mentions complexity but doesn’t act on it.
- **4:** Complexity stated and solution is appropriate.
- **5:** Complexity + avoids common pitfalls (unnecessary passes, extra memory).

### B4. Ownership of AI-generated code (0–5)
Award points only when the candidate explains what the AI produced.
- **0:** Pastes/accepts AI code without explanation.
- **2:** Explains at a surface level.
- **4:** Explains key blocks + how they satisfy requirements.
- **5:** Explains + can modify/refactor confidently when prompted.

**Code Quality Score:**  
> **B = B1 + B2 + B3 + B4** (max 25)

---

## Category C — Verification (0–25)

Meta-preferred rhythm: **prompt → review → run → confirm → move on**.

### C1. Execution frequency (0–8)
Deterministic thresholds (adjust for interview length if needed):
- **0:** Never runs.
- **3:** Runs once near the end.
- **6:** Runs after major milestones (e.g., after first working version + after fixes).
- **8:** Runs iteratively (every meaningful change / chunk).

### C2. Test coverage: normal + edge cases (0–9)
Based on explicit tests executed or clearly reasoned.
- **0:** No tests.
- **3:** One “happy path” test only.
- **6:** Happy path + 1–2 edge cases.
- **9:** Happy path + 3+ edge cases + at least one “failure mode” test.

### C3. Validation of AI output before accepting (0–4)
- **0:** Accepts AI output blindly.
- **2:** Skims; minor checks.
- **4:** Reads critically + verifies assumptions (inputs/outputs, complexity, constraints).

### C4. Debug discipline (0–4)
- **0:** Random changes; no diagnosis.
- **2:** Some diagnosis.
- **4:** Reproduces issue → isolates cause → fixes → reruns tests.

**Verification Score:**  
> **C = C1 + C2 + C3 + C4** (max 25)

---

## Category D — Communication (0–25)

Measures narration, decision transparency, and balanced AI collaboration.

### D1. Continuous narration of intent (0–8)
- **0:** Silent / unexplained actions.
- **4:** Occasional explanations.
- **6:** Explains major decisions.
- **8:** Explains decisions + keeps interviewer synced (“now I’m testing X because…”).

### D2. Explains tradeoffs and decisions (0–7)
- **0:** No tradeoffs discussed.
- **3:** Mentions tradeoffs vaguely.
- **5:** Concrete tradeoffs (runtime vs memory, simplicity vs generality).
- **7:** Tradeoffs + why chosen approach fits constraints.

### D3. AI collaboration balance (0–5)
- **0:** “Prompts their way out of it” / defers reasoning to AI.
- **3:** Uses AI as helper but sometimes unclear.
- **5:** Uses AI tactically (syntax, boilerplate, alternatives) while owning reasoning.

### D4. Summarizes current status + next step (0–5)
- **0:** No checkpoints.
- **2:** One status update.
- **4:** Regular “here’s where we are” updates.
- **5:** Updates + clear next action and why.

**Communication Score:**  
> **D = D1 + D2 + D3 + D4** (max 25)

---

## Mandatory Penalties (apply after A–D)

These enforce “use AI, but show understanding” and “don’t prompt your way out of it.”

### P1. Over-reliance on AI penalty (0 to −15)
Apply the largest that fits:
- **−15:** Accepts AI solution with minimal understanding; can’t explain key parts.
- **−10:** Uses AI to decide core algorithm without justification in own words.
- **−5:** Uses AI appropriately but repeatedly copies without review.

### P2. No-run penalty (−10)
- **−10** if the candidate never executes code / never validates outputs.

### P3. Critical miss penalty (−10)
- **−10** if the final solution violates a stated constraint (e.g., wrong complexity, wrong output format) and the candidate doesn’t catch it.

---

## Final Score

> **Final = clamp(A + B + C + D + P1 + P2 + P3, 0, 100)**

---

## Quick Scoring Sheet (printable)

- **Problem Solving (25):** A1 __/6, A2 __/7, A3 __/7, A4 __/5  
- **Code Quality (25):** B1 __/8, B2 __/7, B3 __/5, B4 __/5  
- **Verification (25):** C1 __/8, C2 __/9, C3 __/4, C4 __/4  
- **Communication (25):** D1 __/8, D2 __/7, D3 __/5, D4 __/5  
- **Penalties:** P1 __, P2 __, P3 __  
- **Total:** __/100

---

## Determinism Notes (for evaluator agreement)

1. **Only score observable behaviors** (spoken explanation, executed tests, explicit reasoning).
2. **Use thresholds** (number of runs, number of edge-case tests).
3. **Apply penalties consistently** for blind AI reliance, lack of testing, and uncaught constraint violations.