## Goal
Implement Phase 5 as an evidence-driven tool-surface review for pi-codegraph: record the current baseline and gating evidence, then keep or fully remove each candidate tool strictly according to observed usage so the registered surface, docs, and tests stay aligned without deprecation shims.

## Acceptance Criteria
1. The saved Phase 5 artifact set under `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/` includes a baseline note stating that the current repo still registers `resolve_edge` and `delete_edge` in `src/index.ts`, still documents them as default public tools in `README.md`, still has tests asserting that surface, and that Phase 5 is not already complete even though Phase 3 and Phase 4 appear landed from local code and history.
2. The same artifact set records that Phase 3 and Phase 4 verification was attempted, that the currently available confirmation comes primarily from local git history, and that live GitHub PR metadata was not obtainable through the current `gh_status` path.
3. Before any keep/delete change is finalized, the Phase 5 plan or summary records the post-Phase-4 telemetry observation window, per-tool call counts for `resolve_edge`, `delete_edge`, `graph_query`, `graph_overview`, and `dead_code`, and the re-checked Phase 3 structural-question pick-rate result showing improvement after the earlier surface reduction.
4. For each candidate tool named in AC3, Phase 5 records a keep/delete decision tied to that tool’s own observed usage count; any tool with non-zero observed usage remains on the surface and is not removed for aesthetic cleanup.
5. If `resolve_edge` or `delete_edge` has zero observed usage, that tool is removed completely from `src/index.ts` registration, its exposed schema/registration surface, README and ARCHITECTURE tool listings, and tests, with no deprecation shim, compatibility alias, or warning text.
6. If `graph_query`, `graph_overview`, or `dead_code` has zero observed usage, that dev-mode tool is evaluated under the same zero-usage rule as AC5 and is removed completely if and only if its observed usage count is zero.
7. Any candidate tool kept after the review remains functional with its current guarantees preserved: if kept, `resolve_edge` still requires non-empty evidence, rejects unresolved or ambiguous symbols, invalid edge kinds, and self-edges, and only creates or updates agent-provenance edges; if kept, `delete_edge` still rejects unresolved or ambiguous symbols, invalid edge kinds, and missing agent-created edges, and only deletes agent-created edges; any kept dev-mode tool remains registered only under `CODEGRAPH_DEVMODE=1` and keeps its existing callable schema and runtime behavior.
8. After the evidence-driven decisions land, `src/index.ts`, README, ARCHITECTURE, and surface/assertion tests agree exactly on the final candidate-tool surface, and no removed tool remains documented, registered, or asserted anywhere.

## Out of Scope
- Making any keep/delete decision before the telemetry window and pick-rate re-check are recorded.
- Changing graph, store, or indexing internals beyond the exposed tool surface, docs, and tests.
- Reworking non-candidate tools outside this evidence-driven Phase 5 cut.
- Adding deprecation periods, compatibility aliases, or warning text for removed tools.
- Requiring live GitHub PR title/state confirmation for Phase 3 or Phase 4 in this slice; the saved limitation note is sufficient until GitHub access is available again.
- Requiring a specific evidence table format; a compact inventory table is allowed but not mandatory.

## Open Questions
None.

## Requirement Traceability
- R1 -> AC 1
- R2 -> AC 3
- R3 -> AC 3
- R4 -> AC 4
- R5 -> AC 5
- R6 -> AC 6
- R7 -> AC 4
- R8 -> AC 5, AC 6, AC 8
- R9 -> AC 7
- R10 -> AC 8
- R11 -> AC 1
- R12 -> AC 2
- O1 -> Out of Scope
- O2 -> Out of Scope
- D1 -> Out of Scope
- D2 -> Out of Scope
- D3 -> Out of Scope
- D4 -> Out of Scope
- C1 -> AC 3
- C2 -> AC 4
- C3 -> Out of Scope
- C4 -> AC 5, AC 6
- C5 -> AC 7
- C6 -> AC 3
- C7 -> AC 1, AC 2
