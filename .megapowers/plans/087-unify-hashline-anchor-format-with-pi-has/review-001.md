---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 4
  - 7
  - 1
  - 2
  - 3
  - 5
  - 6
  - 8
  - 9
  - 10
approved_tasks:
  - 4
  - 7
needs_revision_tasks:
  - 1
  - 2
  - 3
  - 5
  - 6
  - 8
  - 9
  - 10
---

### Task 1: Add pi-hashline-compatible line hash helper — ❌ REVISE
- Coverage overclaims AC 16. The golden-vector test exercises `computeLineHash(...)`, not a codegraph-emitted `LINE:HASH` token parsed/rechecked against the corresponding file line.
- Step 5 should not say downstream tasks are required; after Task 1 the full suite should still pass.

### Task 2: Switch computeAnchor to bare editable anchors — ❌ REVISE
- AC 8 is only partially covered. The implementation handles missing files/out-of-range indexes, but `readFileSync(...)` can still throw for otherwise unavailable line content and should return stale/non-editable instead.
- The tests cover missing file but not out-of-range and unreadable/directory cases.
- Add the emitted-anchor compatibility test for AC 16 here, using `computeAnchor(...).anchor`, a `^(\d+):([0-9a-f]{3})$` parse, and recomputing the expected hash from that file line without importing pi-hashline-readmap internals.

### Task 3: Initialize hash helper in extension tools — ❌ REVISE
- Public executor initialization is directionally correct, but the plan does not cover the many direct unit tests that call `computeAnchor`, `symbolGraph`, `impact`, `trace`, `symbolCard`, `renderLegacyNeighborhoodBody`, or `readSourceSnippet` without `ensureHashInit()`.
- Add a dedicated follow-up task after Task 3 or expand the plan so the direct test suite initializes hashing and `bun test` can pass.

### Task 4: Render neighborhood anchors with separate file context — ✅ PASS
No task-local issues found.

### Task 5: Render symbol-resolution candidates with separate file context — ❌ REVISE
- AC 10 is incomplete. `src/tools/symbol-graph.ts` has a separate ambiguity renderer in `renderLegacyNeighborhoodBody(...)`; updating `src/tools/symbol-resolution.ts` does not update `symbolGraph({ include: ["neighborhood"] })` ambiguity output.
- Add `src/tools/symbol-graph.ts` and a regression test for `symbolGraph(... include: ["neighborhood"] ...)` with multiple matches.

### Task 6: Render symbol card anchors with separate file context — ❌ REVISE
- The tests call `symbolCard(...)`, but public `symbol_graph` default/card output uses `renderSymbolCardBody(...)` through `symbolGraph(...)`, not `symbolCard(...)`.
- Add a test that calls `symbolGraph({ name, store, projectRoot })` and asserts `file  LINE:HASH` output with no `file:line:` token.

### Task 7: Render impact anchors with separate file context — ✅ PASS
No task-local issues found.

### Task 8: Render trace anchors with separate file context — ❌ REVISE
- AC 12 also requires file-scoped miss candidates to render file and bare anchors separately. The task updates `formatFileScopedMiss(...)` but the test only covers static trace steps.
- Add a `trace({ entry, file: "missing.ts", ... })` regression where matches exist in other files.

### Task 9: Render source snippets with compatible line hashes — ❌ REVISE
- AC 14 says invalid requested ranges must still return `null`; the existing test file has missing-file and null-`end_line` coverage but no explicit invalid-range regression.
- Add invalid range tests for `start_line < 1`, `end_line` beyond file length, and `start_line > end_line`.
- Ensure existing valid `readSourceSnippet(...)` tests initialize hashing.

### Task 10: Update anchor-format documentation — ❌ REVISE
- AC 20 is incomplete. Root `VISION.md` still claims every response carries `file:line:hash` and that agents can edit immediately/no rereading.
- Add `VISION.md` to the files and update it with the same file-context + bare `LINE:HASH` + read-before-edit caveat used in README/ARCHITECTURE.

### Missing Coverage
No AC identifier is missing by textual reference in the task files, but substantive coverage gaps remain for AC 8, AC 10, AC 12, AC 14, AC 15/full public-output sweep, AC 16, and AC 20.

### Verdict
revise — see `.megapowers/plans/087-unify-hashline-anchor-format-with-pi-has/revise-instructions-1.md` for prescriptive task-specific changes.
