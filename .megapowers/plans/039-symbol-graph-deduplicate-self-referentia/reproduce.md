# Reproduction: self-referential edges produce duplicate neighbor entries

## Steps to Reproduce
1. Create a `SqliteGraphStore` with one node (e.g., `Foo` at `src/a.ts::Foo:1`)
2. Add a self-referential `calls` edge where `source === target === "src/a.ts::Foo:1"`
3. Call `store.getNeighbors(nodeId)` with default direction (`"both"`)
4. Call `symbolGraph({ name: "Foo", store, projectRoot })` and inspect the Callers section

## Expected Behavior
- `getNeighbors` should return 1 entry for the self-referential edge
- `symbolGraph` output should show the self-referential caller at most once

## Actual Behavior
- `getNeighbors` returns **2 identical entries** — one from the `"out"` query and one from the `"in"` query
- `symbolGraph` renders **2 identical lines** in the Callers section

```
### Callers
  src/a.ts:1:XXXX  Foo  calls  confidence:0.7  agent [hub, tested]
  src/a.ts:1:XXXX  Foo  calls  confidence:0.7  agent [hub, tested]
```

## Evidence

Test output from `bun test test/repro-039-self-referential-dedup.test.ts`:

```
error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 1
Received: 2

      at test/repro-039-self-referential-dedup.test.ts:69:32
(fail) self-referential edge should not produce duplicate caller entries [24.37ms]

error: expect(received).toBe(expected)

Expected: 1
Received: 2

      at test/repro-039-self-referential-dedup.test.ts:110:28
(fail) getNeighbors returns duplicate rows for self-referential edges with direction=both [0.99ms]
```

### Root cause mechanism
`getNeighbors` with direction `"both"` (the default) concatenates results from two queries:
```typescript
// sqlite.ts:145
return [...this.fetchNeighborRows(nodeId, "out", kind), ...this.fetchNeighborRows(nodeId, "in", kind)];
```

For a self-referential edge (`source === target`):
- The `"out"` query matches (`e.source = nodeId`) and joins `n.id = e.target` → returns the node
- The `"in"` query matches (`e.target = nodeId`) and joins `n.id = e.source` → returns the same node

Both queries return the same (node, edge) pair, so the union has 2 identical entries.

In `symbol-graph.ts`, the partitioning loop at lines 97-112 doesn't deduplicate, so both copies land in `callerResults` (since `nr.edge.target === node.id` is true for both).

## Environment
- Bun 1.3.11
- macOS
- pi-codegraph (TypeScript, SQLite via bun:sqlite)

## Failing Test
`test/repro-039-self-referential-dedup.test.ts` — two tests:
1. `self-referential edge should not produce duplicate caller entries` — tests symbolGraph output
2. `getNeighbors returns duplicate rows for self-referential edges with direction=both` — tests store layer directly

## Reproducibility
Always — deterministic, reproduces on every run.
