# Reproduction: trace static mode picks arbitrary first callee instead of covering all branches

## Steps to Reproduce
1. Create a graph with a function `indexProject` that has 3 outgoing `calls` edges to: `walkFiles` (same file, line 2), `runLsp` (same file, line 3), `runCoverage` (different file)
2. `walkFiles` is a leaf node (no outgoing calls)
3. Call `trace({ entry: "indexProject", ... })` with no coverage data (forces static fallback)
4. Inspect the output for all 3 callees

## Expected Behavior
The trace output should include all 3 callees of `indexProject`: `walkFiles`, `runLsp`, and `runCoverage`. A complete static trace should represent the full execution shape (all branches), not just one linear path.

## Actual Behavior
The trace only includes `indexProject` → `walkFiles`, missing `runLsp` and `runCoverage` entirely.

Exact output:
```
## Trust
status: mixed
evidence: tree-sitter  stale-files: 0/0
mode: static (heuristic, no runtime evidence) [stale]
src/pipeline.ts:1:7c16  indexProject  function [stale] [untested]
src/pipeline.ts:2:34b1  walkFiles  function [stale] [leaf, untested]
```

## Evidence

### Root cause in code
`src/tools/trace.ts` lines 38-52, `buildStaticTrace`:

```typescript
function buildStaticTrace(store: GraphStore, startNodeId: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = startNodeId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    ordered.push(currentId);
    const nextNeighbors = store.getNeighbors(currentId, { direction: "out", kind: "calls" });
    const next = nextNeighbors.sort((a, b) => a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || a.node.id.localeCompare(b.node.id))[0];
    currentId = next?.node.id ?? null;  // ← takes only [0], discards all other callees
  }

  return ordered;
}
```

The algorithm:
1. At each node, gets all outgoing `calls` edges
2. Sorts them by file path, then start_line, then id
3. **Takes only `[0]`** — the first callee in sort order
4. Follows that single callee, repeating until chain ends

This means at every branching point, only 1 of N callees is followed. All other branches are silently dropped.

### Test output
```
error: expect(received).toContain(expected)

Expected to contain: "runLsp"
Received: "## Trust\nstatus: mixed\nevidence: tree-sitter  stale-files: 0/0\nmode: static (heuristic, no runtime evidence) [stale]\nsrc/pipeline.ts:1:7c16  indexProject  function [stale] [untested]\nsrc/pipeline.ts:2:34b1  walkFiles  function [stale] [leaf, untested]\n"
```

## Environment
- Bun 1.3.11
- macOS
- pi-codegraph (TypeScript, SQLite graph store)

## Failing Test
`test/repro-041-trace-static-arbitrary-first.test.ts`

Sets up a graph: `indexProject` calls 3 functions (`walkFiles`, `runLsp`, `runCoverage`). Asserts all 3 appear in the trace output. Currently fails because only `walkFiles` (the alphabetically/positionally first callee) appears.

## Reproducibility
Always — 100% deterministic. The sort order is stable, so it always picks the same first callee.
