---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 2
  - 1
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
approved_tasks:
  - 2
needs_revision_tasks:
  - 1
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
---

### Task 1: Extract shared compact card renderer — ❌ REVISE
- Step 1 / Step 3 lock `renderSymbolCardBody()` to the current standalone `symbolCard()` body, but `src/tools/symbol-card.ts` currently emits `### Source` and `### Exported`. If Task 3 uses that helper as the default `symbol_graph` base, AC 6 / AC 7 fail immediately.
- Turning `symbolCard()` into a thin wrapper around that helper would also break the existing internal `tool-symbol-card-*` tests that still expect the standalone card shape.

### Task 2: Extract shared legacy neighborhood renderer — ✅ PASS
No issues.

### Task 3: Make symbol_graph default to compact card — ❌ REVISE
- The neighborhood-migration file list is incomplete. `test/tool-symbol-graph-lsp.test.ts` still has execute-path assertions that expect legacy `Callers` / `Implemented By` sections from the registered `symbol_graph` tool.
- The task overlaps Task 5 by describing contract-append behavior as part of the Task 3 implementation instead of focusing on base-view selection.
- As written, Task 3 also depends on Task 1’s helper shape being revised; otherwise the default output will still include `### Source` / `### Exported`.

### Task 4: Validate include values and preserve legacy neighborhood output — ❌ REVISE
- Step 2’s expected failure is inaccurate. The new test uses Bun `expect(...)` assertions, so the actual failure will be an `expect(received).toBe(true)` style assertion failure, not the custom strings listed.
- Step 2 also omits the current `include:["source"]` rejection, which still fails before this task lands.
- Step 3 updates the TypeBox schema but not the execute-path include cast in `src/index.ts`, leaving the runtime typing stale.

### Task 5: Append contract sections from the shared contract renderer — ❌ REVISE
- This task has no credible RED state. Current `src/tools/symbol-graph.ts` already appends `renderSymbolContractBody()` after the base body, so after Tasks 3-4 the proposed tests are likely already green.
- Because of that, Step 2’s expected FAIL is not defensible, and the task is mis-scoped. It should be merged into Task 3 / Task 4 or repurposed to a currently uncovered criterion.

### Task 6: Append source sections from the shared source renderer — ❌ REVISE
- The task only covers happy paths. `include:["source"]` is a new include-driven path, but there are no missing / ambiguous regression tests for it.
- Step 3 exports a source helper and uses it from `symbol_graph`, but it does not route the old `symbolCard()` source block through that helper. That does not prove AC 15 (“same path previously used for card/source output”).

### Task 7: Remove standalone symbol_card and symbol_contract registrations — ❌ REVISE
- Registration removal itself is fine, but the task claims AC 19 without any `symbol_graph` output assertions.
- The current file list only covers wiring / metadata / description registration. It does not prove that outputs contain no deprecation or migration ceremony.

### Task 8: Update public docs for the unified symbol_graph surface — ❌ REVISE
- `[no-test]` is not valid as written for the docs/tool-description drift part of AC 22. There is no automated test that reads `README.md`, `ARCHITECTURE.md`, or `docs/tool-descriptions.md`.
- The verification command only runs typecheck plus `test/extension-tool-descriptions.test.ts`, which does not validate the docs being edited.
- The AC 21 audit-note instruction is not concrete enough from the task alone; it needs an explicit artifact path under `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/`.

### Missing Coverage
- AC 19: no task currently contains actual `symbol_graph` output assertions proving there are no deprecation / migration warnings.
- AC 22: automated docs/tool-description drift coverage is missing; existing tests only cover registered tool descriptions, not `README.md` / `ARCHITECTURE.md` / `docs/tool-descriptions.md`.
- AC 17 / AC 18 are only exercised for the default base and contract include; the new `include:["source"]` path has no explicit missing / ambiguous regression coverage.
- Task-level AC callouts live in `plan.md`; the task files themselves do not state which ACs they cover.

### Verdict
- **revise** — the plan is not ready for implementation until the task sequence is made internally consistent and the missing coverage above is addressed.
