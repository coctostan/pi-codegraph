---
id: 48
type: feature
status: done
created: 2026-03-24T02:55:14.413Z
priority: 1
---
# Type signature extraction from tree-sitter AST
## Goal

Extend the tree-sitter extraction pipeline to capture type signatures for functions, classes, and interfaces. This is the prerequisite data layer for `symbol_card` and `symbol_contract`.

## Current state

`extractFile()` in `src/indexer/tree-sitter.ts` captures symbol name, kind, file, line range, content hash, and is_exported — but **no type information**. The `GraphNode` type in `src/graph/types.ts` has no fields for parameter types, return types, or type parameters.

## Scope

### Schema additions
- Add optional `signature` field to `GraphNode` (a compact string like `(store: GraphStore, projectRoot: string) => string`)
- Add `signature TEXT` column to SQLite `nodes` table (nullable, schema migration)

### Tree-sitter extraction
- For `function_declaration` and `arrow_function`: extract parameter names + type annotations, return type annotation
- For `class_declaration`: extract constructor signature, `extends`/`implements` clauses  
- For `interface_declaration`: extract `extends` clauses and method signatures
- Store as a compact normalized string, not raw AST — this is for agent consumption

### What NOT to do
- No doc comment extraction yet (separate issue)
- No invariant inference
- No deep type resolution (just surface syntax — `string`, `GraphStore`, not resolved paths)
- Don't break any existing tests

## Files involved

- `src/graph/types.ts` — add `signature?: string` to `GraphNode`
- `src/graph/sqlite.ts` — add column, update `addNode`/`hydrateNode`/queries
- `src/graph/store.ts` — update `GraphStore` interface if needed
- `src/indexer/tree-sitter.ts` — extract signatures during AST walk
- `src/output/anchoring.ts` — may need to include signature in anchored output

## Exit criteria

- `extractFile()` populates `signature` for functions, arrow functions, classes, and interfaces
- Signatures survive round-trip through SQLite store
- Existing 270 tests still pass
- New tests verify signature extraction for representative cases
