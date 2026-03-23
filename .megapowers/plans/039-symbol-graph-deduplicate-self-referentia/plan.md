# Plan

### Task 1: Deduplicate self-referential edges in getNeighbors "both" path

### Task 1: Deduplicate self-referential edges in getNeighbors "both" path

**Files:**
- Modify: `src/graph/sqlite.ts`
- Test: `test/repro-039-self-referential-dedup.test.ts` (existing — contains both store-layer and tool-layer tests)

**Step 1 — Adopt the existing failing tests**

The repro file `test/repro-039-self-referential-dedup.test.ts` already contains two passing-when-fixed tests:

1. **Store layer** (`getNeighbors returns duplicate rows for self-referential edges with direction=both`): Creates a node with a self-referential `calls` edge, calls `store.getNeighbors(nodeId)` with default `"both"` direction, asserts `neighbors.length` is `1`.

2. **Tool layer** (`self-referential edge should not produce duplicate caller entries`): Creates a node with a self-referential `calls` edge, calls `symbolGraph({ name: "Foo", store, projectRoot })`, filters output lines matching the self-referential caller pattern, asserts at most 1 matching line.

No changes needed to the test file.

**Step 2 — Run tests, verify they fail**

Run: `bun test test/repro-039-self-referential-dedup.test.ts`

Expected: FAIL — two failures:
- `error: expect(received).toBe(expected) Expected: 1 Received: 2` (store-layer test)
- `error: expect(received).toBeLessThanOrEqual(expected) Expected: <= 1 Received: 2` (tool-layer test)

**Step 3 — Write minimal implementation**

In `src/graph/sqlite.ts`, replace the `getNeighbors` method (lines 140-146) to deduplicate the `"both"` path using the edge's composite primary key `(source, target, kind, provenance_source)`:

```typescript
getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[] {
  const direction = options?.direction ?? "both";
  const kind = options?.kind;
  if (direction === "out") return this.fetchNeighborRows(nodeId, "out", kind);
  if (direction === "in") return this.fetchNeighborRows(nodeId, "in", kind);
  const outRows = this.fetchNeighborRows(nodeId, "out", kind);
  const inRows = this.fetchNeighborRows(nodeId, "in", kind);
  const seen = new Set<string>();
  const result: NeighborResult[] = [];
  for (const nr of [...outRows, ...inRows]) {
    const key = `${nr.edge.source}\0${nr.edge.target}\0${nr.edge.kind}\0${nr.edge.provenance.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(nr);
    }
  }
  return result;
}
```

This deduplicates by the same composite key used as the edges table's `PRIMARY KEY`, so it only collapses true duplicates — different edges between the same nodes (e.g., different provenance sources) are preserved.

**Step 4 — Run tests, verify they pass**

Run: `bun test test/repro-039-self-referential-dedup.test.ts`

Expected: PASS — both tests green

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing
