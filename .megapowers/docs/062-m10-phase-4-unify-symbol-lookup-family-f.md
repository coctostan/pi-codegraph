# 062 — Unify symbol lookup on `symbol_graph`

## Summary
This change makes `symbol_graph` the single public symbol lookup tool for pi-codegraph.

The public lookup surface now defaults to a compact symbol card instead of the legacy full neighborhood view. Agents can still request the legacy relationship graph with `include: ["neighborhood"]`, and can append shared `contract` and `source` sections with `include: ["contract"]` and `include: ["source"]`.

## Why this was built
The previous surface split symbol inspection across multiple public tools:
- `symbol_graph` for neighborhoods
- `symbol_card` for compact lookup
- `symbol_contract` for behavioral contract details

That forced agents to choose between overlapping tools and created documentation, registration, and output-shape drift risk. This phase consolidates the surface around one public entry point while preserving the existing rendering logic as shared internal modules.

## What changed

### Public tool surface
- `symbol_graph` remains the only public symbol lookup/inspection tool.
- Public registration of `symbol_card` and `symbol_contract` was removed.
- The public default tool set is now:
  - `symbol_graph`
  - `resolve_edge`
  - `delete_edge`
  - `impact`
  - `trace`

### `symbol_graph` behavior
- Default call:
  - `symbol_graph({ name })`
  - returns a compact card with identity, signature, covering tests, key relationships, and inline signals.
- `include: []` matches omitted `include`.
- `include: ["neighborhood"]` switches the base output back to the preserved legacy neighborhood view.
- `include: ["contract"]` appends the shared contract section.
- `include: ["source"]` appends the shared source section.
- `include: ["neighborhood", "contract", "source"]` keeps the neighborhood as the base and appends contract then source.
- Invalid include values are rejected by schema validation; only `"neighborhood"`, `"contract"`, and `"source"` are allowed.

### Shared renderer refactor
- `src/tools/symbol-card.ts`
  - exports `renderSymbolCardBody()` for the compact default base view
  - exports `renderSymbolSourceSection()` for reusable source rendering
- `src/tools/symbol-contract.ts`
  - continues to export `renderSymbolContractBody()`
- `src/tools/symbol-graph.ts`
  - composes the active base view and optional appended sections through those shared renderers
  - exports `renderLegacyNeighborhoodBody()` to preserve the pre-change neighborhood body exactly

### Error-path behavior
- Not-found lookups stay explicit.
- Ambiguous lookups stay explicit.
- Include-driven requests no longer duplicate not-found or ambiguity blocks when a unique symbol cannot be resolved.

### Docs and downstream audit
- `README.md`, `ARCHITECTURE.md`, and `docs/tool-descriptions.md` now describe `symbol_graph` as the unified public lookup surface.
- `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md` records the downstream audit and the accepted external out-of-scope break.

## Key files changed
- `src/index.ts`
- `src/tools/symbol-card.ts`
- `src/tools/symbol-graph.ts`
- `src/tools/symbol-contract.ts`
- `README.md`
- `ARCHITECTURE.md`
- `docs/tool-descriptions.md`
- `test/tool-symbol-card-render-body.test.ts`
- `test/tool-symbol-graph-default-card.test.ts`
- `test/tool-symbol-graph-legacy-neighborhood.test.ts`
- `test/tool-symbol-graph-render-neighborhood-body.test.ts`
- `test/tool-symbol-graph-source-include.test.ts`
- `test/tool-symbol-graph-contract-include.test.ts`
- `test/docs-symbol-graph-unified-surface.test.ts`
- wiring and registry regression tests under `test/` and `tests/`

## Verification
Completed verification for the shipped state:
- `bun test` → 444 pass, 0 fail
- `bun run check` → pass
- `bun run build` → pass (`nothing to build`)

Targeted verification also confirmed:
- only `symbol_graph` is publicly registered for symbol lookup
- include schema accepts only `neighborhood`, `contract`, and `source`
- default output is the compact card
- `include: ["neighborhood"]` is byte-identical to the preserved legacy neighborhood body
- source/contract sections append through shared renderers
- docs are aligned with the unified surface

## Outcome
Agents now have one public symbol lookup entry point with a compact default, an explicit compatibility path for the old neighborhood view, and reusable internal renderers that keep the output surface consistent and easier to maintain.
