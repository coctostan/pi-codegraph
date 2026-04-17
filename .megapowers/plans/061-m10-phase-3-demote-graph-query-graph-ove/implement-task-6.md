# Implement Task 6 — Reconcile public, dev-mode, and internal docs

## Scope
Updated project docs to match the current registered tool surface and the new `symbol_graph.include` option.

## Files changed
- `README.md`
- `ARCHITECTURE.md`
- `docs/tool-descriptions.md`

## Changes
- Documented the 7-tool default public surface.
- Documented the 3 dev-mode-only tools behind `CODEGRAPH_DEVMODE=1`.
- Marked `symbol_search` as internal-only.
- Added `symbol_graph({ name, include: ["contract"] })` to README.
- Updated architecture overview and file-layout comments to match the current implementation.
- Updated tool description maintenance guidance to reflect the public/dev/internal split.

## Verification
- `bun test && bun run check`
- Result: pass
