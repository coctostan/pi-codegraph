## Goal
Distinguish unknown coverage indexing state from known uncovered symbols so symbol signal tags report `coverage-unknown` when coverage data has not been indexed, while preserving `tested` and `untested` semantics when coverage data is known.

## Acceptance Criteria
1. `GraphStore` declares a `hasCoverageData(): boolean` method for reading graph-level coverage indexing state.
2. `SqliteGraphStore.hasCoverageData()` returns `false` when no coverage-indexed metadata has been persisted for the database.
3. `SqliteGraphStore.hasCoverageData()` returns `true` after coverage-indexed metadata has been persisted, and the value survives closing and reopening the same SQLite database.
4. `runCoverageIndexStage(store, projectRoot, coverageDir)` persists coverage-indexed state after a successful coverage-stage execution, including successful executions that produce zero outgoing `tested_by` edges.
5. A symbol with an outgoing `tested_by` edge continues to emit the `tested` signal tag and must not emit `untested` or `coverage-unknown`; runtime-only execution without an outgoing `tested_by` edge must not be treated as `tested`.
6. A symbol with no outgoing `tested_by` edge emits the `coverage-unknown` signal tag when `store.hasCoverageData()` is `false`.
7. A symbol with no outgoing `tested_by` edge emits the `untested` signal tag when `store.hasCoverageData()` is `true`.
8. For the same graph inputs, changing only the graph-level coverage-indexed state must not change non-coverage signal behavior, including roles, fan-in, fan-out, framework mediation, export status, and co-change score.
9. Existing signal tests are updated for the new coverage-state semantics, and `bun test` plus `bun run check` pass.

## Out of Scope
- Adding a separate `runtime-covered` or `covered-but-not-by-test` signal is excluded from this issue.
- Redesigning coverage parsing, coverage report discovery, or test-trace construction is excluded except for recording and reading coverage-indexed state.
- Changing the meaning of `tested_by` edges is excluded; they continue to represent test-backed coverage.
- Building a broader metadata framework is not required; a generic metadata table is allowed only if it remains the simplest SQLite-backed way to persist the coverage-indexed flag.
- Broad refactors outside `src/graph/store.ts`, `src/graph/sqlite.ts`, `src/indexer/coverage.ts`, and `src/output/signals.ts` are out of scope unless required by tests or direct callers.

## Open Questions
None.

## Requirement Traceability
- `R1 -> AC 6`
- `R2 -> AC 7`
- `R3 -> AC 5`
- `R4 -> AC 1`
- `R5 -> AC 2, AC 3`
- `R6 -> AC 4`
- `R7 -> AC 6, AC 7`
- `R8 -> AC 8`
- `R9 -> AC 9`
- `O1 -> Out of Scope` — allowed only if it stays simpler than a one-off sentinel; not required for this slice.
- `O2 -> AC 6, AC 9`
- `D1 -> Out of Scope`
- `D2 -> Out of Scope`
- `D3 -> Out of Scope`
- `C1 -> AC 2, AC 3`
- `C2 -> Out of Scope`
- `C3 -> AC 8`
- `C4 -> AC 5`
- `C5 -> Out of Scope`
