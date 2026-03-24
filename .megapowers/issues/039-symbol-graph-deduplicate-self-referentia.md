---
id: 39
type: bugfix
status: closed
closed: 2026-03-23
closing_note: "Fixed. Deduplication added in SqliteGraphStore.getNeighbors via composite key Set for direction=both queries. Self-referential edges rejected at creation in resolve_edge. Verified by repro-039 and self-ref tests (all pass)."
created: 2026-03-23T12:35:28.419Z
priority: 1
---
# symbol_graph: deduplicate self-referential and duplicate neighbor entries

## Observed behavior

Calling `symbol_graph("SqliteGraphStore")` returns this in its Callers section:

```
### Callers
  ...
  src/graph/sqlite.ts:36:9c6d  SqliteGraphStore  calls  confidence:0.7  agent [hub, tested]
  src/graph/sqlite.ts:36:9c6d  SqliteGraphStore  calls  confidence:0.7  agent [hub, tested]
```

Two identical lines. The node is listed as calling itself, twice.

## Root cause

`src/tools/symbol-graph.ts:90-112` — `getNeighbors(node.id)` is called with direction `"both"` (default). For a self-referential edge (source === target === node.id), the store returns it from both the "out" join (`fetchNeighborRows` with `e.source = ?`, joining `n.id = e.target`) and the "in" join (`e.target = ?`, joining `n.id = e.source`). Since both resolve to the same node, the partitioning logic at lines 103-111 categorizes both as callers (edge.target === node.id is true for both, because source === target).

```typescript
// symbol-graph.ts:97-112
for (const nr of allNeighbors) {
  if (nr.node.file.startsWith("__unresolved__")) {
    unresolvedResults.push(nr);
    continue;
  }
  if (nr.edge.kind === "calls") {
    if (nr.edge.target === node.id) {
      callerResults.push(nr);        // ← both copies land here for self-edges
    } else {
      calleeResults.push(nr);
    }
  } else if (nr.edge.kind === "imports" && nr.edge.source === node.id) {
    importResults.push(nr);
  }
}
```

No deduplication happens before or after this loop.

## Expected behavior

Each unique neighbor relationship should appear exactly once. Deduplicate by `(node.id, edge.kind, edge.provenance.source)` composite key before rendering. Self-referential edges should either be filtered entirely (a node calling itself isn't useful signal) or rendered once with a `[self]` marker.

## Files involved

- `src/tools/symbol-graph.ts` — neighbor partitioning loop (lines 97-112)
- `src/graph/sqlite.ts:140-146` — `getNeighbors()` returns duplicates for self-edges via the both-direction union
