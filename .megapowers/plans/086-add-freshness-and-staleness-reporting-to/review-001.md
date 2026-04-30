---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
approved_tasks:
  - 1
needs_revision_tasks:
  - 2
  - 3
  - 4
  - 5
  - 6
---

### Per-Task Assessment

### Task 1: Add shared result-scoped freshness evaluator — ✅ PASS
No blocking issues. The task covers the shared evaluator behavior and uses real project APIs (`SqliteGraphStore`, `GraphNode`, `GraphEdge`, `sha256Hex`, `queryRows`).

### Task 2: Strip compact freshness headers — ❌ REVISE
- Step 1 and Step 3 contradict AC 2. The plan makes `suppressFreshTrustHeader("Trust: fresh\nbody\n")` strip compact fresh headers, but the spec requires public fresh output to begin with `Trust: fresh` when `suppressTrustHeader` is not enabled.
- Revise so `suppressFreshTrustHeader` remains legacy-only for `## Trust/status: fresh`; only `stripTrustHeader` should remove compact `Trust:` headers.

### Task 3: Report symbol graph freshness — ❌ REVISE
- Step 3 is not self-contained enough for the stated quality bar. It gives snippets and uses `any[]` rather than real project types.
- It should provide concrete compiling edits, including the exact import changes, typed helper, removal of the now-unused `stats` line, and exact replacement for the final return.

### Task 4: Warn on stale impact results — ❌ REVISE
- Step 3 is ambiguous: it says to replace each `prependTrustHeader(...)` call but does not show exact edits for every early return path.
- It must show where `targetNodes` and `withFreshness` are declared so validation, ambiguous, not-found, addition, empty, and non-empty paths all compile and use the freshness wrapper.

### Task 5: Warn on unreliable trace freshness — ❌ REVISE
- Missing coverage for stale static `calls` edges. AC 10 explicitly includes stale call edges, but the proposed test only covers stale/deleted trace steps and unresolved stored steps.
- Step 3 also does not pass result edges into `evaluateFreshness`, so stale call edges would not be detected.
- Step 3 contains placeholders like `staticSteps.map(...)` and should be made self-contained.

### Task 6: Verify compact suppress behavior end to end — ❌ REVISE
- Invalid TDD ordering: it depends on Tasks 2–5, so its Step 2 should not fail after dependencies are complete. The expected failure is described as occurring before those dependencies, which cannot happen when executing the plan in order.
- Step 3 has no concrete implementation. Convert this into a no-test final verification task, or move the end-to-end suppression test into the task that implements compact `stripTrustHeader` behavior.

### Missing Coverage
No acceptance criteria are completely missing by task label, but AC 10 is not substantively covered because stale static call edges are not tested or implemented.

### Verdict
revise — Tasks 2–6 need the changes recorded in `.megapowers/plans/086-add-freshness-and-staleness-reporting-to/revise-instructions-1.md` before implementation.
