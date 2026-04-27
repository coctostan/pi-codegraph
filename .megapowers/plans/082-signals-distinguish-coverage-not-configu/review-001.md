---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 7
  - 4
  - 5
  - 6
approved_tasks:
  - 1
  - 2
  - 3
  - 7
needs_revision_tasks:
  - 4
  - 5
  - 6
---

Coverage is complete (all 9 ACs are mapped). The blocker is **TDD ordering**: Tasks 4 and 5 ship `formatRoleTags` / `formatImpactWhy` changes globally, but the existing tests in `test/output-signals.test.ts`, `test/tool-symbol-graph-signals.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-trace-signals.test.ts`, and `test/extension-readonly-trust-gating.test.ts` still assert `untested` / `coverage:untested` on manually-built stores. Under the current order, Task 4 Step 5 ("full suite all passing") is impossible — the suite is RED until Task 6 lands.

Per-task assessment:

- Task 1 — ✅ PASS. Test code, sqlite metadata table, and persistence test are all real and complete.
- Task 2 — ✅ PASS. Three independent fixtures cover the missing/empty/no-records cases for AC4. Implementation is a single `store.markCoverageIndexed()` line at end of `runCoverageIndexStage`.
- Task 3 — ✅ PASS. Adds `coverageKnown` to `NodeSignals` and the empty-node fallback. Works with the existing cache shape.
- Task 4 — ❌ REVISE. Step 5 is wrong under current order; the suite cannot be green until Task 6 has run. Reorder so Task 6 precedes Task 4. See revise-instructions-1.md.
- Task 5 — ❌ REVISE. Same Step 5 problem. Additionally, the explicit language "existing tests will FAIL... Task 6 updates those tests; do not chase them here yet" violates the plan template's contract that Step 5 is green every task.
- Task 6 — ❌ REVISE. Should be the test-fixture preparation step that runs BEFORE Tasks 4/5, framed as `[no-test]` (it's a fixture-only edit, no behavior change today since `coverageKnown` is still ignored by formatters). Drop `tool-impact-ranking.test.ts` from the file list — its `compareDetails` only reads `signals.tested`, so the ranking orderings hold without `markCoverageIndexed()`.
- Task 7 — ✅ PASS (only `depends_on` needs to update to `[2, 5]` after the reorder; instructions noted in handoff).

Revision handoff: `.megapowers/plans/082-signals-distinguish-coverage-not-configu/revise-instructions-1.md`. New linear order: `1 → 2 → 3 → 6 → 4 → 5 → 7`.
