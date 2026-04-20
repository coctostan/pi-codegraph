---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 4
  - 3
  - 5
approved_tasks:
  - 1
  - 2
  - 4
needs_revision_tasks:
  - 3
  - 5
---

## Per-Task Assessment

### Task 1 — ✅ PASS
Pure helper + unit tests. No change from prior approval.

### Task 2 — ✅ PASS
Readonly-stale-DB pattern produces `## Trust\nstatus: stale` + `## foo (function)` in baseline. Verified live. Step 2's updated failure text is accurate.

### Task 3 — ❌ REVISE
`extractFile` produces only **unresolved** cross-file edges (`src/caller.ts::caller:2 --calls--> __unresolved__::shared:0`). Verified live: with the current seed, `impact({ symbols: ["shared"] })` returns `"No dependents found — 'shared' is an entry point with no callers."`, so `expect(baselineText).toContain("caller")` fails. Fix: insert a manual `seed.addEdge({ source: "src/caller.ts::caller:2", target: "src/shared.ts::shared:1", kind: "calls", ... })` before `seed.close();`. With that edge in place, impact names `caller` in the baseline as expected.

### Task 4 — ✅ PASS
Trace integration unchanged from prior approval.

### Task 5 — ❌ REVISE
Sub-test 1 (`indexing-failed note`) is broken. `ensureIndexed` (src/index.ts:127-132) runs on every tool call and unconditionally sets `lastIndexError = null` on success, so `setLastIndexErrorForTesting(new Error("transient scan failure"))` injected between calls is wiped before the note helper reads it. Verified live: the output contains no `indexing-failed` line at all. Fix: replace sub-test 1 with the readonly-stale-DB pattern, which produces a genuine `indexing-failed (<N>s ago): readonly database` note that persists across calls via the clear-guard at src/index.ts:165 (it explicitly preserves the literal `"readonly database"` message). Drop the `setLastIndexErrorForTesting` import since no sub-test uses it anymore.

Sub-tests 2 (devmeta), 3 (fresh body preservation), 4 (stale body preservation), and 5 (trace false-vs-omitted) are all correct.

## Missing Coverage
None.

## Handoff
`.megapowers/plans/075-trust-header-add-opt-out-flag-to-suppres/revise-instructions-2.md` has exact code blocks for both fixes: the `seed.addEdge({...})` call for Task 3 and the complete replacement sub-test 1 for Task 5, with live-verified baseline output samples.
