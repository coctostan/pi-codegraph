---
id: 41
type: bugfix
status: in-progress
created: 2026-03-23T12:35:45.160Z
priority: 1
---
# trace: static trace picks arbitrary first callee instead of covering all branches

## Observed behavior

`trace("indexProject")` returns:
```
indexProject → runCoverageIndexStage → parseCoverageReports → toPosixPath
```

But `indexProject` (pipeline.ts:53-129) actually calls: walkTsFiles, extractFile, sha256Hex, TsServerClient, runLspIndexStage, runAstGrepIndexStage, runCoverageIndexStage, runGitCoChangeStage. The trace misses 7 of 8 callees and follows one arbitrary branch.

Confirmed by `symbol_graph("indexProject")` which correctly shows all 8 callees.

## Root cause

`src/tools/trace.ts:38-52` — `buildStaticTrace` picks a single next callee at each step:

```typescript
const nextNeighbors = store.getNeighbors(currentId, { direction: "out", kind: "calls" });
const next = nextNeighbors.sort((a, b) =>
  a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || ...
)[0];  // ← takes only the first callee alphabetically
currentId = next?.node.id ?? null;
```

Sort is alphabetical by file path, so `src/indexer/coverage.ts` wins over `src/indexer/git.ts`, `src/indexer/lsp.ts`, `src/indexer/pipeline.ts`, and `src/indexer/tree-sitter.ts`.

## Expected behavior

The trace should represent the full execution shape. Options:
1. **Flattened DFS** — list all reachable nodes in depth-first order with indentation marking depth
2. **Breadth-first with all siblings** — at each depth level, include all callees before descending
3. **Topological order** — show all nodes in dependency-respecting order

The key constraint: output must remain a flat anchored list (not a tree) to stay agent-friendly, but it should include all branches, not just one.

## Files involved

- `src/tools/trace.ts` — `buildStaticTrace` (lines 38-52), `trace` function (lines 95-129)
