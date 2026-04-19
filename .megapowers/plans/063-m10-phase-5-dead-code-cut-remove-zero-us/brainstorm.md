## Goal
Determine whether M10 Phase 5 has already been completed and, if not, capture the concrete requirements for an evidence-driven dead-code cut that removes only zero-usage tools after the required telemetry and pick-rate gates are satisfied. Current repo evidence shows the issue is only partially progressed: Phases 3 and 4 appear landed, but Phase 5 itself is not implemented in code, tests, or docs.

## Mode
Direct requirements

The desired outcome is concrete: establish current status from the codebase and PR history, confirm the gating evidence, and preserve the Phase 5 requirements clearly enough for spec work. This is requirements capture, not ideation.

## Must-Have Requirements
R1. The Phase 5 artifact must record the current baseline that `resolve_edge` and `delete_edge` are still registered in `src/index.ts`, still covered by tests, and still documented as public default tools in `README.md`.

R2. The Phase 5 plan must document the telemetry observation window collected after Phases 1–4 were live, including per-tool call counts for every deletion candidate.

R3. The Phase 5 plan must explicitly record that the Phase 3 success criterion was re-checked and passed: tool-pick-rate on structural questions rose after the surface reduction work.

R4. If a candidate tool shows real usage in the observation window, it must not be deleted for aesthetic reasons.

R5. If `resolve_edge` and `delete_edge` show zero usage in the observation window, they must be fully removed rather than deprecated.

R6. If any dev-mode tool (`graph_query`, `graph_overview`, `dead_code`) also shows zero usage in the observation window, it must be evaluated under the same evidence-driven deletion rule.

R7. Every keep/delete decision must be backed by per-tool evidence in the Phase 5 plan or summary.

R8. Deleted tools must be removed completely from registration, schemas, docs, and tests; no deprecation shims or output warnings may be introduced.

R9. Any tools kept after the review must remain functional with their current behavioral guarantees preserved.

R10. README, ARCHITECTURE/docs, test expectations, and actual registered tool surface must agree after Phase 5 lands.

R11. The brainstorm output must preserve the status-check result that Phase 5 is not already solved, while noting that Phase 3 and Phase 4 appear landed from local history and current code state.

R12. The brainstorm output must preserve that PR verification was attempted and was confirmed primarily from local git history because live GitHub status lookup was unavailable through the current `gh_status` path.

## Optional / Nice-to-Have
O1. Confirm live GitHub PR states/titles for the Phase 3 and Phase 4 changes once GitHub status/query access is available again.

O2. Include a compact inventory table in the later plan showing each candidate tool, current surface (public/dev/internal), observed usage count, and final decision.

## Explicitly Deferred
D1. Making deletion decisions before telemetry and pick-rate evidence exists.

D2. Changing graph/store/indexing architecture beyond the model-facing tool surface.

D3. Reworking non-candidate tools that are outside the evidence-driven Phase 5 cut.

D4. Adding deprecation periods, compatibility aliases, or warning text for removed tools.

## Constraints
C1. Phase 5 is gated on telemetry collected after Phases 1–4 have been live for a meaningful sample window.

C2. Deletion decisions must be evidence-driven, not aesthetic.

C3. The graph, store, and schema are intended to stay intact; Phase 5 changes the exposed tool layer, tests, and docs.

C4. No deprecation warnings or shims should be added if a tool is removed.

C5. Current codebase evidence shows `resolveEdge` and `deleteEdge` are single-caller tool functions invoked from `piCodegraph`, with current contracts that validate symbol resolution, edge kind validity, and agent-edge semantics. If either tool is kept, these semantics must remain intact.

C6. The telemetry source and the Phase 3 pick-rate re-check have been confirmed externally by the user and should be treated as available inputs to later phases even though they are not stored in this repo.

C7. Local git history confirms the Phase 3 and Phase 4 merge lineage strongly enough for requirements capture; live GitHub PR metadata is still only partially verifiable from the current tool path.

C8. Brainstorm artifacts must be saved under `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/` before phase advancement.

## Open Questions
None.

## Recommended Direction
Start Phase 5 from an explicit baseline instead of assuming the issue is already done. The codebase still publicly exposes `resolve_edge` and `delete_edge`, README still documents them, and tests still assert their presence. That means the repository state is not “already resolved”; it is only prepared for a telemetry-driven cut.

The next step should be a narrow, evidence-first spec. Do not treat this as a general cleanup pass. The scope is to evaluate candidate tools against the confirmed telemetry window and the confirmed Phase 3 pick-rate result, then make per-tool keep/delete decisions with written evidence.

When that evidence is applied, evaluate each candidate independently. Keep anything with real usage. Remove only tools with zero usage, and remove them completely across registration, docs, schemas, and tests. This preserves the refocus goal without inventing churn or weakening power-user capability without proof.

Because live GitHub PR state could not be fully confirmed through the current `gh_status` path, later phases should cite local merged-commit evidence for #40 and #41 unless/until direct GitHub verification is available again. That limitation is real, but it does not block Phase 5 requirements capture.

## Testing Implications
- Verify the current baseline with focused checks on tool registration, README tool lists, and the existing wiring/description tests.
- In later phases, update tests only after a telemetry-backed keep/delete decision is made.
- If a tool is deleted, tests asserting its registration and behavior must be removed or replaced with new surface expectations.
- Re-run doc-surface consistency checks so README/docs and `src/index.ts` agree.
- If a tool is kept, ensure its current validation and agent-edge behavior still pass unchanged.
