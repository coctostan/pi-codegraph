## Goal
Finish unifying the overlapping symbol-inspection surface by making `symbol_graph` the single public symbol lookup tool, changing its default output to a compact card-style view, preserving the old detailed neighborhood view behind an explicit include, and removing `symbol_card` / `symbol_contract` as standalone registered tools while keeping their internal rendering logic reusable.

## Mode
`Direct requirements`

The issue body, roadmap, current code, and recent Phase 3 groundwork already constrain the direction tightly. The remaining work is clarifying exact behavior and preserving scope decisions explicitly, not exploring multiple solution families.

## Must-Have Requirements
R1. `symbol_graph` is the only registered public tool for symbol lookup/inspection after this phase.

R2. `symbol_card` is no longer registered with pi after this phase.

R3. `symbol_contract` is no longer registered with pi after this phase.

R4. The internal extraction/rendering logic currently used for card and contract views remains reusable by `symbol_graph` and internal callers; removing public registration must not require duplicate divergent implementations.

R5. `symbol_graph` default output changes from the legacy full-neighborhood view to a compact card-style view.

R6. The default card-style view includes the symbol definition/identity.

R7. The default card-style view includes the symbol signature.

R8. The default card-style view includes inline signals.

R9. The default card-style view includes a top relationship summary.

R10. The default card-style view includes covering tests.

R11. The default card-style view does not include the current standalone `Exported` section.

R12. Omitting `include` returns the default card-style view.

R13. Passing `include: []` returns the default card-style view.

R14. In this phase, `symbol_graph.include` accepts only `"neighborhood"`, `"contract"`, and `"source"` values.

R15. Unsupported `include` values are rejected by schema validation.

R16. `include: ["neighborhood"]` returns the legacy full-neighborhood `symbol_graph` view.

R17. The output for `include: ["neighborhood"]` is byte-identical to the current legacy `symbol_graph` output for the same input.

R18. When `"neighborhood"` is combined with other includes, the neighborhood view becomes the base output.

R19. `include: ["contract"]` appends a contract section rather than replacing the base output.

R20. The appended contract section is generated through the same extraction/rendering path that currently powers `symbol_contract`.

R21. `include: ["source"]` appends a source section rather than replacing the base output.

R22. The appended source section reuses the existing source-snippet rendering path used by current card/source output.

R23. Contract and source sections append to whichever base output is active.

R24. Not-found symbol lookups remain explicit and graceful in the default card view and in include-driven views.

R25. Ambiguous symbol lookups remain explicit and graceful in the default card view and in include-driven views.

R26. No deprecation warnings or migration ceremony are added to tool output for the removed standalone tools.

R27. `README.md`, `ARCHITECTURE.md`, and tool-description sources are updated to reflect the unified symbol lookup surface and the new include-based usage.

R28. Known downstream references to `symbol_card` and `symbol_contract` are audited before commit.

R29. Any downstream consumer still relying on `symbol_card` or `symbol_contract` as registered tools is updated, or the break is explicitly documented and accepted as out of scope.

R30. Tests that assert registered tools, schemas, and symbol output behavior are updated for the new surface and output defaults.

R31. Snapshots are renewed where needed.

R32. The full existing test suite passes after the change.

## Optional / Nice-to-Have
O1. Add README migration examples that map former `symbol_card(...)` and `symbol_contract(...)` use cases to equivalent `symbol_graph(...)` calls.

O2. Record before/after default public tool counts for this phase to make the surface reduction explicit.

O3. Extract a small shared internal helper for symbol resolution and empty-state formatting so card, neighborhood, contract, and source views stay consistent.

## Explicitly Deferred
D1. Explicit `include: ["signals"]` schema support; the default card already includes signals, so a separate toggle is deferred.

D2. Any additional `include` values beyond `"neighborhood"`, `"contract"`, and `"source"`.

D3. Making contract data part of the default `symbol_graph` output rather than opt-in.

D4. Evidence-driven removal of `resolve_edge` or `delete_edge` based on telemetry; that belongs to Phase 5.

D5. Any change to the graph store, SQLite schema, indexing pipeline, or `.codegraph/` layout.

D6. Any new public parameter whose only purpose is to expose information the default card already presents.

## Constraints
C1. Phase 4 should extend existing `symbol_graph`, card, contract, and source rendering paths rather than introducing a parallel symbol-inspection pipeline.

C2. `include: ["neighborhood"]` must preserve the current legacy `symbol_graph` output byte-for-byte.

C3. Default output must remain compact; richer sections appear only when explicitly requested via `include`.

C4. The graph/store/indexer and existing output-ceremony behavior stay unchanged except where necessary to support the unified tool surface.

C5. Code, README, architecture docs, and tool descriptions must agree on which tools are publicly registered after the change.

C6. Internal exports currently used by tests or future internal/CODI consumers must not be silently broken.

C7. The default compact card keeps `Signature` and drops `Exported`.

C8. No new public parameter should exist solely to expose information that the default card already presents.

C9. The planned CODI v0.2 gate is considered satisfied for this issue.

## Open Questions
None.

## Recommended Direction
Implement Phase 4 as a base-view plus additive-sections model. The new default `symbol_graph` response should be a compact card assembled from the existing symbol-card concepts: definition/identity, signature, signals, top relationships, and tests. `include: ["neighborhood"]` should be the explicit escape hatch to the old detailed graph output, and it should stay byte-identical to today’s legacy `symbol_graph` output to minimize regression risk. `contract` and `source` should append to whichever base view is active. `signals` should stay out of the schema for now because the default card already includes it and M10 is about removing redundant knobs, not adding them.

Implementation should favor reuse, not reinvention. Keep the current card/contract/source rendering logic available internally, remove only the public registration of `symbol_card` and `symbol_contract`, and have `symbol_graph` call into the shared logic. If necessary, pull common symbol-resolution, ambiguous-match, and not-found handling into a small helper so the default card, legacy neighborhood view, and appended sections all behave consistently.

The consumer and documentation work is part of the feature, not cleanup. The scan already found downstream references in `pi-coding-tools` prompt-assembler files, so the change should include an explicit audit and either update those references or document the break as accepted scope. Update `README.md`, `ARCHITECTURE.md`, and tool-description sources to present one symbol-inspection entry point with explicit examples for default, neighborhood, contract, and source modes.

## Testing Implications
- Add registration tests proving `symbol_card` and `symbol_contract` are no longer registered.
- Add schema tests proving `symbol_graph.include` accepts only `"neighborhood"`, `"contract"`, and `"source"` in this phase, and rejects `"signals"` and other values.
- Add output tests proving the default `symbol_graph` response is the new card-style view when `include` is omitted or empty.
- Add regression tests proving `include: ["neighborhood"]` is byte-identical to the pre-change legacy `symbol_graph` output.
- Add combination tests proving `contract` and `source` append to the active base output, including when combined with `"neighborhood"`.
- Add tests proving the default card keeps `Signature` and omits `Exported`.
- Add not-found and ambiguous-match tests for both default and include-driven modes.
- Add reuse tests proving appended contract/source sections come from shared internal rendering paths rather than divergent implementations.
- Update doc/description drift checks and renew snapshots where output shape changes.
- Audit known downstream references before commit and capture whether they were updated or explicitly accepted as out of scope.
- Run the full suite green after all test rewrites.
