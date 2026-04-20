---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 4
  - 2
  - 3
  - 5
approved_tasks:
  - 1
  - 4
needs_revision_tasks:
  - 2
  - 3
  - 5
---

## Per-Task Assessment

### Task 1 — ✅ PASS
Pure helper, unit test is correct. Probed live: `bun test` with a missing named export emits the exact error `SyntaxError: Export named 'stripTrustHeader' not found in module ...`, matching Step 2. Implementation preserves `suppressFreshTrustHeader` verbatim.

### Task 2 — ❌ REVISE
Schema sub-test correct. Integration sub-test's baseline assertion `baselineText.startsWith("## Trust\nstatus: heuristic")` is wrong. Verified live: fresh-graph `symbol_graph` through the pi extension returns `status: fresh` → auto-suppressed → baseline starts with `## foo (function)`. Use the readonly-stale-DB pattern (see revise-instructions-1.md) to produce a genuine non-fresh trust state.

### Task 3 — ❌ REVISE
Same root cause as Task 2: `expect(baselineText.includes("## Trust")).toBe(true)` fails because fresh-graph `impact` baseline has no Trust header. Use the same readonly-stale-DB pattern on a shared/caller setup.

### Task 4 — ✅ PASS
Trace explicitly passes `mode: "heuristic"` in `src/tools/trace.ts:136`, so `baseline.startsWith("## Trust\nstatus: heuristic")` is correct. Schema test and integration test both sound.

### Task 5 — ❌ REVISE
Sub-tests 1 and 2 (`indexing-failed` note and devmeta footer) are correct. Sub-test 3 (body preservation) and sub-test 4 (false-vs-omitted equality) both assume fresh `symbol_graph` emits a Trust header — wrong. Split sub-test 3 into Option A (fresh graph, direct equality) + Option B (stale graph via readonly-DB, equality-after-strip), and rewrite sub-test 4 to use `trace` which reliably emits heuristic status.

## Missing Coverage
None — all 14 ACs are referenced. The issue is incorrect test assumptions, not coverage gaps.

## Handoff
`.megapowers/plans/075-trust-header-add-opt-out-flag-to-suppres/revise-instructions-1.md` contains exact replacement test code, the verified "readonly-stale-DB" pattern from `test/extension-readonly-trust-gating.test.ts`, and updated Step 2 expected-failure text for Tasks 2 and 3.
