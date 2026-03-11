---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 2
  - 3
  - 4
  - 1
approved_tasks:
  - 2
  - 3
  - 4
needs_revision_tasks:
  - 1
---

### Task 1: Refresh stale persisted graph before serving tool results — ❌ REVISE
- Coverage is good and Step 3 now uses the correct codebase API (`ensureIndexed()` → `await indexProject(projectRoot, store);`).
- However, the task still fails the granularity rule. Step 1 exercises **two observable tool behaviors** in one regression (`symbol_graph` and `trace`), and the task text still frames this as one task covering both tools.
- The review criteria require one task to be one test + one implementation. Narrow this task to a single representative regression (for example, `symbol_graph` only), or split the `trace` check into a separate task.
- I wrote prescriptive edits for the test body, failure text, and coverage sentence in `revise-instructions-2.md`.

### Task 2: Make trace report ambiguous symbol matches explicitly — ✅ PASS
No issues.

### Task 3: Make impact reject ambiguous symbol seeds — ✅ PASS
No issues.

### Task 4: Accept single-quoted WHERE string literals in graph_query — ✅ PASS
No issues.

### Missing Coverage
- No acceptance criteria are completely uncovered.

### Verdict
- **revise** — Task 1 still needs to be narrowed to a single regression/implementation unit before the plan is ready for implementation.
