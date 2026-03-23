---
id: 40
type: feature
status: in-progress
created: 2026-03-23T12:35:36.657Z
priority: 1
---
# symbol_graph: render all edge kinds, not just calls and imports

## Observed behavior

`graph_query` reveals SqliteGraphStore has edges of kinds: calls, imports, implements, extends, tested_by, co_changes_with, renders, routes_to. But `symbol_graph("SqliteGraphStore")` only shows Callers (calls edges), Callees (calls edges), and Imports. The other 6 edge kinds are invisible.

## Root cause

`src/tools/symbol-graph.ts:103-111` — the neighbor loop only has branches for `calls` and `imports`. All other edge kinds fall through silently:

```typescript
if (nr.edge.kind === "calls") {
  // ... categorize as caller or callee
} else if (nr.edge.kind === "imports" && nr.edge.source === node.id) {
  importResults.push(nr);
}
// ← implements, extends, tested_by, co_changes_with, renders, routes_to: silently dropped
```

There is a bolt-on in `src/index.ts:98-114` (`renderImplementationsSuffix`) that adds an Implementations section, but only for interface nodes and only for `implements` edges. This leaves extends, tested_by, co_changes_with, renders, and routes_to completely absent from symbol_graph output.

## Expected behavior

All edge kinds should render as labeled sections. For example: `### Extends`, `### Tested By`, `### Co-changes With`, `### Routes To`. This gives agents a complete neighborhood view without needing to drop to graph_query.

## Files involved

- `src/tools/symbol-graph.ts` — neighbor loop (lines 97-112), section building (lines 114-117)
- `src/index.ts` — `renderImplementationsSuffix` bolt-on (lines 98-114) should be removed once symbol-graph.ts handles all kinds natively
