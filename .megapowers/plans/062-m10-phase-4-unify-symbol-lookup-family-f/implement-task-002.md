# Task 2 implementation

Completed Task 2: Extract shared legacy neighborhood renderer.

## Changes
- Added `renderLegacyNeighborhoodBody()` and `RenderedSymbolNeighborhood` export in `src/tools/symbol-graph.ts`.
- Kept `symbolGraph()` delegating to the extracted legacy renderer, then prepending the trust header and appending the existing contract section when requested.
- Added regression test `test/tool-symbol-graph-render-neighborhood-body.test.ts`.

## Verification
- `bun test test/tool-symbol-graph-render-neighborhood-body.test.ts`
- `bun test`
