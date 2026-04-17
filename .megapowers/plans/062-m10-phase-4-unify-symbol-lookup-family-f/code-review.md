## Files Reviewed
- `src/index.ts` — tightened `symbol_graph.include` schema and reduced the public tool registry to the unified lookup surface.
- `src/tools/symbol-card.ts` — extracted shared compact-card and source-section renderers used by `symbol_graph` and internal callers.
- `src/tools/symbol-graph.ts` — switched default output to the compact card, preserved legacy neighborhood rendering behind `include: ["neighborhood"]`, and composed optional contract/source sections.
- `src/tools/symbol-contract.ts` — retained the shared contract renderer consumed by `symbol_graph`.
- `README.md` — updated public usage to document `symbol_graph` default/neighborhood/contract/source patterns.
- `ARCHITECTURE.md` — updated architecture/public-surface documentation for the unified lookup tool.
- `docs/tool-descriptions.md` — aligned tool-surface maintenance guidance with the 5-tool public surface.
- `test/tool-symbol-card-wiring.test.ts` — verified `symbol_card` is no longer registered while internal renderers remain exported.
- `test/tool-symbol-contract-wiring.test.ts` — verified `symbol_contract` is no longer registered while the shared contract renderer remains exported.
- `test/tool-symbol-graph-default-card.test.ts` — covered default output, empty include, and explicit not-found/ambiguity handling.
- `test/tool-symbol-graph-legacy-neighborhood.test.ts` and `test/tool-symbol-graph-render-neighborhood-body.test.ts` — locked down legacy neighborhood compatibility.
- `test/tool-symbol-graph-contract-include.test.ts` and `test/tool-symbol-graph-source-include.test.ts` — covered append behavior and error-path regression cases.
- `test/docs-symbol-graph-unified-surface.test.ts` — guarded against doc/tool-surface drift.

## Strengths
- `src/index.ts:23-35` constrains `symbol_graph.include` to the exact supported values, which keeps the public contract narrow and validates the new surface at the schema boundary.
- `src/index.ts:175-211` cleanly makes `symbol_graph` the single public lookup tool while preserving the existing read-only execution path and trust-header/token-meta flow.
- `src/tools/symbol-card.ts:49-118` isolates the compact default renderer into a reusable internal API with a small, clear output contract.
- `src/tools/symbol-graph.ts:175-205` composes the base view and optional sections through shared renderers instead of cloning contract/source formatting logic.
- `README.md:11-15`, `README.md:68-76`, `ARCHITECTURE.md:59`, and `docs/tool-descriptions.md:25-26` are aligned on the new public surface, which reduces future documentation drift.
- `test/tool-symbol-graph-contract-include.test.ts:97-129` and `test/tool-symbol-graph-source-include.test.ts:73-104` now cover the important edge case where include-driven lookups should not duplicate not-found or ambiguity output.

## Findings

### Critical
None.

### Important
None.

### Minor
None.

## Recommendations
- If the internal standalone `symbolCard()` entry point remains long-term, consider eventually composing more of it through `renderSymbolCardBody()` to reduce future drift between the standalone/internal path and the default `symbol_graph` base view. This is not blocking for this change.

## Assessment
ready

I found one contained correctness issue during review: `symbol_graph` was appending contract/source sections even when the lookup had already resolved to a not-found or ambiguous base, which duplicated the error block. That was fixed in `src/tools/symbol-graph.ts:174-205` by appending optional sections only for uniquely resolved symbols, and regression coverage was added in `test/tool-symbol-graph-contract-include.test.ts:97-129` and `test/tool-symbol-graph-source-include.test.ts:73-104`.

Post-fix verification:
- `bun test` → 444 pass, 0 fail
- `bun run check` → pass
