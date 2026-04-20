---
id: 74
type: bugfix
status: open
created: 2026-04-20T10:32:55.991Z
priority: 1
---
# impact: doesn't traverse implements edges — interface changes show no blast radius
## Problem

`collectImpactDetails` (src/tools/impact.ts:66) only traverses inbound `calls` edges:

```ts
const inbound = dedupeInboundByStrongestEdge(
  store.getNeighbors(current.id, { direction: "in", kind: "calls" })
);
```

TypeScript codebases have a critical edge type that's ignored: `implements`. When `GraphStore` changes its interface, every class that implements it (`SqliteGraphStore`) is a breaking dependent, and every caller of *those* classes is a behavioral dependent. Today `impact(["GraphStore"], "signature_change")` returns nothing.

## Expected behaviour

For `signature_change` and `removal` change types, `collectImpactDetails` should perform a one-hop `implements` expansion before entering the main BFS loop:

1. Collect all direct `implements` inbound neighbors of each seed symbol
2. Add them to the queue at `depth: 1` with classification `breaking`
3. Continue the existing `calls` BFS from those implementors

The `NeighborOptions.kind` field already supports different edge kinds — check `src/graph/store.ts:4` for the `kind` type options.

## Concrete test case

```
impact(["GraphStore"], "signature_change")
→ should include SqliteGraphStore (breaking, depth:1)
→ should include getOrCreateStore (breaking or behavioral, depth:2)
→ should include piCodegraph (behavioral, depth:3)
```

## Location

- `src/tools/impact.ts` — `collectImpactDetails()`, starting at line 89
- `src/graph/store.ts` — `NeighborOptions` type (line 3) — confirm `kind` accepts the implements edge label used by the LSP indexer
- `src/indexer/lsp.ts` — check what edge kind string is used when writing `implements` edges (search for `"implements"`)

## Acceptance criteria

- `impact(["GraphStore"], "signature_change")` includes `SqliteGraphStore` at depth 1 as `breaking`
- `impact(["GraphStore"], "removal")` same
- `impact(["GraphStore"], "behavior_change")` same
- Existing tests for `calls`-only traversal still pass
- No duplicate entries when a symbol both calls and implements a changed symbol
