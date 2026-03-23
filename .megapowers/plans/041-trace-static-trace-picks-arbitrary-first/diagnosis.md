# Diagnosis

## Root Cause

`buildStaticTrace()` in `src/tools/trace.ts:38-52` implements a **linear chain follower**, not a graph traversal. At each step it:

1. Gets all outgoing `calls` edges via `store.getNeighbors(currentId, { direction: "out", kind: "calls" })`
2. Sorts by file path → start_line → id
3. **Takes only `[0]`** — the single first callee in sort order
4. Advances `currentId` to that callee, discarding all siblings

This was originally intentional for v1 (the code review for M4 issue-025 noted: _"The static fallback takes the first callee after sorting, producing a single linear path. This is by design (spec says 'one trace only') but means fork points are silently ignored rather than annotated. Fine for v1."_). The tool description still says "Return one deterministic anchored execution path."

However, this design makes the trace tool effectively useless for any function that calls more than one thing — which is most non-trivial code. The `indexProject` example in the issue calls 8 functions but the trace shows only 1, with zero indication that 7 were dropped.

## Trace

**Symptom:** `trace("indexProject")` returns only `indexProject → walkFiles` (2 nodes)

**Data flow:**
1. `trace()` (line 95) resolves the entry symbol → `indexProject` node
2. No coverage data → falls through to static path (line 124)
3. `buildStaticTrace(store, node.id)` called (line 124)
4. **Inside buildStaticTrace (line 38-52):**
   - Iteration 1: `currentId = "indexProject"`. Gets 3 neighbors: `walkFiles` (line 2), `runLsp` (line 3), `runCoverage` (different file). Sort puts `walkFiles` first (same file, lowest start_line). `[0]` picks `walkFiles`. Siblings `runLsp` and `runCoverage` discarded.
   - Iteration 2: `currentId = "walkFiles"`. Gets 0 neighbors (leaf). `next = undefined`. `currentId = null`. Loop ends.
5. Returns `["indexProject", "walkFiles"]` — missing `runLsp` and `runCoverage`

## Affected Code

| File | Function | Lines | Role |
|------|----------|-------|------|
| `src/tools/trace.ts` | `buildStaticTrace` | 38-52 | **The bug** — linear chain follower, not graph traversal |
| `src/tools/trace.ts` | `trace` | 124-128 | Consumer — maps `buildStaticTrace` output to formatted lines |
| `src/tools/trace.ts` | `formatLiveTraceLine` | 74-88 | Formats each step — will need to handle depth if DFS is used |
| `src/index.ts` | tool registration | 206-217 | Tool description says "one path" — needs update |

## Pattern Analysis

### Working: `collectImpactDetails` in `src/tools/impact.ts:66-119`
```typescript
// BFS queue — processes ALL neighbors at each level
while (queue.length > 0) {
  const current = queue.shift()!;
  const inbound = dedupeInboundByStrongestEdge(store.getNeighbors(current.id, ...));
  for (const neighbor of inbound) {    // ← iterates ALL neighbors
    queue.push({ id: neighbor.node.id, depth, chainConfidence });
  }
}
```
- Uses a queue-based BFS
- Iterates **all** neighbors at each level
- Tracks `seen` to avoid revisiting, with depth-based dedup
- Correctly traverses the full graph

### Working: `symbolGraph` in `src/tools/symbol-graph.ts:90-112`
```typescript
const allNeighbors = store.getNeighbors(node.id);
for (const nr of allNeighbors) {     // ← iterates ALL neighbors
  if (nr.edge.kind === "calls") {
    calleeResults.push(nr);          // collects all callees
  }
}
```
- Collects all neighbors in a single pass
- Shows all callees in the output

### Broken: `buildStaticTrace` in `src/tools/trace.ts:38-52`
```typescript
while (currentId && !seen.has(currentId)) {
  const nextNeighbors = store.getNeighbors(currentId, ...);
  const next = nextNeighbors.sort(...)[0];   // ← takes ONLY first
  currentId = next?.node.id ?? null;          // follows one path
}
```
- Linear chain follower — no branching
- Takes `[0]` and discards all siblings
- No recursion, no queue, no stack — just a `while` loop

**Key difference:** impact and symbol_graph iterate all neighbors; buildStaticTrace picks one.

## Risk Assessment

### What depends on `buildStaticTrace`:
- Only `trace()` at line 124 calls it
- All existing static trace tests use **linear chains** (each node has exactly 1 callee), so they would continue to pass with a DFS/BFS approach since a single chain is a degenerate case of full traversal

### What could break:
1. **Output format change** — existing tests assert exact line counts (e.g., `tool-trace-static-mode-header.test.ts` line 72: `expect(lines).toHaveLength(7)`). If the output now includes depth markers or more nodes, these assertions need updating.
2. **Token budget** — full DFS on deep graphs could produce much larger output. May need a depth limit and/or node cap.
3. **Cycle handling** — the current `seen` set prevents infinite loops. A DFS approach must also handle cycles in the call graph.
4. **Tool description** — `src/index.ts:209` says "Return one deterministic anchored execution path" — needs rewording for multi-branch output.
5. **Determinism** — the sort order ensures reproducible output regardless of insertion order. Must be preserved in any DFS/BFS approach.

### Related patterns:
- Coverage trace path (lines 112-122) is inherently ordered by `ordinal` and doesn't have this problem — it uses runtime-recorded execution order.

## Fixed When

1. `buildStaticTrace` returns all reachable nodes via DFS (or equivalent), not just one linear chain
2. Given a node with N callees, all N appear in the trace output
3. Output remains a flat anchored list (no nested tree structure)
4. Cycle handling preserved — no infinite loops on recursive calls
5. Sort order remains deterministic for reproducibility
6. Existing linear-chain tests continue to pass (backward compatible for the single-path case)
7. Repro test `test/repro-041-trace-static-arbitrary-first.test.ts` passes
