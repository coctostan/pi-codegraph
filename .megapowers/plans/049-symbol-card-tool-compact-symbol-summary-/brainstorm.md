# Brainstorm: symbol_card tool — compact symbol summary

## Goal
Add a `symbol_card` tool that returns a compact, structured summary of a symbol — definition anchor, type signature, covering tests, key relationships, and signal badges — in a single call. This gives agents the "glanceable fact sheet" they need before deciding whether to read or change a symbol, without combining multiple tool outputs manually.

## Mode
Direct requirements — the issue description already specifies the output format, data sources, disambiguation behavior, and file layout. No exploratory discussion needed.

## Must-Have Requirements
- **R1**: New tool `symbol_card` registered in `src/index.ts` with params `{ name: string, file?: string }`
- **R2**: Returns a compact card with: symbol name, kind, file anchor, type signature (from `node.signature`), export status, covering tests, key relationships (callers/callees/imports), and signal badges
- **R3**: Uses the same disambiguation pattern as `symbol_graph` — multiple matches returns a list with anchors; not-found returns a trust-headered message
- **R4**: All anchors are hashline-anchored to current file content via `computeAnchor`
- **R5**: Trust header is prepended (using `prependTrustHeader`)
- **R6**: Signature section gracefully degrades to "not available" when `node.signature` is null/undefined
- **R7**: Covering tests come from `tested_by` edges (direction: out)
- **R8**: Key relationships section shows callers, callees, and imports with counts — compact, not full `symbol_graph` detail
- **R9**: Signal badges (hub/tested/leaf/entry-point etc.) shown via existing `formatRoleTags`
- **R10**: Output is flatter and more compact than `symbol_graph` — no per-neighbor confidence/provenance detail

## Optional / Nice-to-Have
- **O1**: Show `extends`/`implements` in the card if present
- **O2**: Configurable section inclusion (e.g., skip relationships if agent only wants signature)

## Explicitly Deferred
- **D1**: Invariant/contract inference (that's `symbol_contract` #050)
- **D2**: Doc comment extraction
- **D3**: Deep type resolution beyond surface syntax

## Constraints
- **C1**: Must not duplicate `symbol_graph` rendering logic — `symbol_card` is a tighter, flatter format
- **C2**: Depends on #048 (type signature extraction) for the Signature section, but must work without it (graceful fallback)
- **C3**: Must not break existing tests
- **C4**: Same tool registration pattern as existing tools (TypeBox params, `ensureIndexed`, `getOrCreateStore`)
- **C5**: All data sources already exist in the graph store — no new store methods needed

## Open Questions
None.

## Recommended Direction
Create `src/tools/symbol-card.ts` with a `symbolCard` function that takes `{ name, file?, store, projectRoot }`. The function uses `store.findNodes` for lookup, `computeAnchor` for anchoring, `store.getNeighbors` for relationships and tests, and `createSignalComputer` for badges. Format the output as a flat markdown card matching the issue's example format.

The tool should reuse existing output helpers (`computeAnchor`, `formatRoleTags`, `prependTrustHeader`) but NOT reuse `formatNeighborhood` — the card format is deliberately flatter. Relationships get summarized as counts with a few top names rather than full per-item detail.

Register in `src/index.ts` following the exact same pattern as `symbol_graph`: TypeBox params, async execute with `getOrCreateStore` + `ensureIndexed`, and optional LSP enrichment for the single resolved node.

## Testing Implications
- Happy path: symbol with signature, tests, callers, callees, imports → verify full card structure
- Ambiguous symbol: multiple matches → verify disambiguation list
- Not-found: no matches → verify trust-headered error
- No tests: symbol with zero `tested_by` edges → verify section absent or "none"
- No signature: symbol with null signature → verify "not available" fallback
- Trust header present in all outputs
- Anchors are valid hashline format
