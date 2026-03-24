# Feature: Add `delete_edge` tool

## Summary
Added a `delete_edge` tool that allows agents to retract incorrect agent-authored edges from the symbol graph. This complements the existing `resolve_edge` tool (create/upsert) with a deletion path.

## Problem
Agent edges created via `resolve_edge` survive re-indexing by design — `deleteFile` explicitly preserves them. Without a deletion mechanism, bad edges (test artifacts, nonsensical relationships like `evidence: "bogus"`) permanently pollute `symbol_graph`, `impact`, and `trace` output.

## Solution
A new `delete_edge` tool registered alongside the existing 5 tools. It:
- Resolves source/target symbols using the same `findNodes()` logic as `resolve_edge`
- Validates edge kind against the `EdgeKind` set
- Checks for an existing agent-provenance edge before deletion (no silent no-ops)
- Only deletes agent-provenance edges — structural edges (tree-sitter, LSP, ast-grep) are protected
- Returns anchored confirmation on success, or descriptive errors on failure

## Files
- **Created:** `src/tools/delete-edge.ts` — pure `deleteEdge` function with `DeleteEdgeParams` interface
- **Created:** `test/tool-delete-edge.test.ts` — 8 tests covering all paths
- **Modified:** `src/index.ts` — import, Typebox schema, tool registration with readonly error handling
- **Modified:** `test/extension-wiring.test.ts` — schema validation test

## API
```
delete_edge({
  source: "symbolName",       // required
  target: "symbolName",       // required
  kind: "calls",              // required — valid EdgeKind
  sourceFile?: "path/to/file", // optional disambiguation
  targetFile?: "path/to/file", // optional disambiguation
})
```

## Test Coverage
268 tests, 0 failures. 8 new tests covering: successful deletion, source/target not found, source/target disambiguation, invalid edge kind, no agent edge found, non-agent edge protection.
