## Goal
Verify that M8 (Contracts and Symbol Cards) is complete and coherent as an integrated milestone. All three source issues (#048, #049, #050) are implemented and passing. No new code is expected.

## Acceptance Criteria
1. All existing tests pass with zero failures (currently 334 tests across 147 files)
2. `symbol_card` tool is registered in `src/index.ts` and callable with `{ name: string, file?: string }` params
3. `symbol_contract` tool is registered in `src/index.ts` and callable with `{ name: string, file?: string }` params
4. Type signatures are extracted by `extractFile()` for functions, arrow functions, classes, and interfaces and persisted via the `signature` column in SQLite
5. All pre-existing tools (`symbol_graph`, `trace`, `impact`, `graph_query`, `resolve_edge`, `delete_edge`) continue to work without regressions

## Out of Scope
- D1: Doc comment extraction
- D2: Cross-function contract composition
- D3: Invariant inference beyond direct AST/test evidence
- O1: Cross-tool consistency verification (symbol_card vs symbol_contract signature agreement) — nice-to-have, not required for close-out

## Open Questions
None.

## Requirement Traceability
- R1 → AC 1
- R2 → AC 2
- R3 → AC 3
- R4 → AC 4
- R5 → AC 5
- O1 → Out of Scope
- D1 → Out of Scope
- D2 → Out of Scope
- D3 → Out of Scope
- C1 → AC 1 (all source issues done implies tests pass)
- C2 → Out of Scope (no new feature work)
