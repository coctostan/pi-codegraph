# Diagnosis

## Root Cause

`SqliteGraphStore.getNeighbors()` with direction `"both"` (line 145 of `src/graph/sqlite.ts`) naively concatenates results from two independent SQL queries — one for outgoing edges and one for incoming. When an edge is self-referential (`source === target`), both queries match the same edge row, producing **two identical `NeighborResult` entries**.

The sole consumer that uses `"both"` direction and is affected is `symbolGraph()` in `src/tools/symbol-graph.ts:90`, which passes the duplicated results into a partitioning loop (lines 97-112) that has no deduplication. Both copies satisfy `nr.edge.target === node.id` (since source === target), so both land in `callerResults`.

## Trace

```
symbolGraph({ name: "Foo" })
  → store.getNeighbors(node.id)           // sqlite.ts:140, direction defaults to "both"
    → [...fetchNeighborRows(id, "out"),    // sqlite.ts:145
        ...fetchNeighborRows(id, "in")]
      // "out": WHERE e.source = id → matches self-edge, JOIN n.id = e.target → returns node
      // "in":  WHERE e.target = id → matches self-edge, JOIN n.id = e.source → returns node
      // Result: 2 identical NeighborResult objects
  → for (const nr of allNeighbors)         // symbol-graph.ts:97
      if (nr.edge.target === node.id)      // true for both copies (source === target)
        callerResults.push(nr)             // both copies pushed
  → buildSection(callerResults, ...)       // renders 2 identical lines
```

## Affected Code

| File | Lines | Role |
|------|-------|------|
| `src/graph/sqlite.ts` | 140-146 | `getNeighbors` — produces duplicates for self-edges with direction `"both"` |
| `src/tools/symbol-graph.ts` | 90, 97-112 | Only consumer using default `"both"` direction; no dedup in partitioning loop |

## Pattern Analysis

**Working code (impact.ts):** Already has `dedupeInboundByStrongestEdge()` (line 45) that deduplicates by node ID, keeping the highest-confidence edge. Uses explicit `direction: "in"` to avoid the `"both"` duplication entirely.

**Working code (trace.ts, signals.ts, index.ts):** All other callers explicitly specify `direction: "in"` or `direction: "out"`, never hitting the `"both"` path.

**Broken code (symbol-graph.ts):** Uses the default `"both"` direction and performs no deduplication. This is the only caller where duplicates are both produced and visible.

**Other `"both"` callers:** `signals.ts:29` uses default direction but only calls `.some()`, so duplicates are harmless. `signals.ts:103-106` manually does out+in (equivalent to "both") but only computes `maxScore`, so duplicates are also harmless.

## Risk Assessment

- **Fix location options:**
  - **Store layer** (`getNeighbors`): Deduplicate in the `"both"` path. Low risk — all callers benefit, but those using explicit directions are unaffected. Must dedup by edge composite key `(source, target, kind, provenance_source)` to avoid collapsing legitimately different edges.
  - **Tool layer** (`symbolGraph`): Add dedup after partitioning. Zero risk to other callers, but doesn't fix the store-level issue for future consumers.
  - **Both**: Belt and suspenders.
  
- **Breaking risk:** Very low. Removing duplicates is purely additive correctness — no caller relies on receiving duplicates.

- **Related patterns:** `signals.ts:103-106` has the same manual out+in concatenation that could produce duplicates, but is functionally unaffected. A store-level fix would proactively prevent this.

## Fixed When

1. `getNeighbors(nodeId)` with direction `"both"` returns exactly 1 entry for a self-referential edge
2. `symbolGraph` output contains at most 1 line per unique neighbor relationship
3. Existing tests continue to pass (no regressions from dedup logic)
