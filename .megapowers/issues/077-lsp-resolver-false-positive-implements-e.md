---
id: 77
type: bugfix
status: open
created: 2026-04-20T10:32:55.992Z
priority: 2
---
# LSP resolver: false-positive "implements" edges on data-only interfaces
## Problem

`symbol_graph("GraphStatistics")` shows:

```
### Implemented By
  src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp
```

`GraphStatistics` is a plain data interface (`{ nodes: Record<string,number>, edges: ..., files: ... }`) with no methods. `SqliteGraphStore` does not implement it — it returns objects of that shape from `getStatistics()`. The LSP resolver is incorrectly creating an `implements` edge.

## Root cause

In `src/indexer/lsp-resolver.ts`, `resolveImplementations` (line 122) or `classImplementsInterface` (line 58) is matching `GraphStatistics` as an interface that `SqliteGraphStore` implements, likely because the class's `getStatistics()` return type references `GraphStatistics` and the LSP "implementations" request is returning it as a match.

## Fix

In `classImplementsInterface` (src/indexer/lsp-resolver.ts:58), add a check: only create an `implements` edge if the target interface appears in the class's `implements` clause in its declaration, not merely in its method return types.

The tree-sitter-parsed `signature` field for `SqliteGraphStore` includes `implements GraphStore` — use that as the ground truth filter rather than relying solely on LSP implementation lookups.

## Acceptance criteria

- `symbol_graph("GraphStatistics")` does not show a "Implemented By" section
- `symbol_graph("GraphStore")` still shows `SqliteGraphStore` in "Implemented By"
- No regression in LSP resolver tests (test/indexer-lsp.test.ts, test/lsp-stage-guarded-writes.test.ts)
