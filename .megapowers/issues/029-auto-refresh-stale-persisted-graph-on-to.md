---
id: 29
type: bugfix
status: open
created: 2026-03-11T14:15:39.151Z
priority: 1
---
# Auto-refresh stale persisted graph on tool invocation
## Summary
Real tool-call testing found that the extension only auto-indexes when the graph store is empty. If `.codegraph/graph.db` already exists but the codebase has changed, tools operate on stale graph data and return stale anchors/line numbers instead of refreshing the index.

## Reproduction
1. Use the repo with an existing `.codegraph/graph.db` built from older source state.
2. Invoke real tools such as:
   - `symbol_graph(name: "GraphStore", file: "src/graph/store.ts")`
   - `trace(entry: "piCodegraph", file: "src/index.ts")`
3. Observe results marked `[stale]` with outdated line numbers/anchors.
4. Compare to a fresh temp copy with an empty DB; the same tool calls return correct current anchors.

## Evidence
- Current repo state returned `GraphStore` at stale anchor `src/graph/store.ts:13:... [stale]`
- Fresh reindex returned `GraphStore` at `src/graph/store.ts:30:...`
- Current repo state returned `piCodegraph` at stale anchor `src/index.ts:71:... [stale]`
- Fresh reindex returned `piCodegraph` at `src/index.ts:101:...`

## Expected
On tool invocation, the extension should detect stale tracked files and refresh the graph (or otherwise ensure results reflect current source state), not merely surface stale markers forever.

## Actual
`ensureIndexed()` only indexes when `store.listFiles().length === 0`, so existing-but-stale databases are not refreshed.

## Impact
High. In normal session reuse, tool results can be outdated and misleading even though the codebase has changed.

