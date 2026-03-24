# Feature: Type Signature Extraction from Tree-sitter AST

## Summary

Extends the tree-sitter indexing pipeline to extract type signatures for functions, arrow functions, classes, and interfaces. Signatures are persisted as a new `signature` field on `GraphNode` and stored in a nullable `signature TEXT` column in SQLite. This is the data layer prerequisite for the `symbol_card` (#049) and `symbol_contract` (#050) tools.

## What Was Built

### Schema Changes
- Added `signature?: string` to the `GraphNode` interface
- Added `signature TEXT` nullable column to SQLite `nodes` table via migration (same `ALTER TABLE` pattern as `is_exported`)
- Updated all node persistence and query paths: `addNode`, `hydrateNode`, `getNode`, `findNodes`, `getNodesByFile`, `getNeighbors`/`fetchNeighborRows`

### Signature Extraction
Three new extraction helpers in `src/indexer/tree-sitter.ts`:

- **`extractFunctionSignature`** — Extracts `<T>(param: Type, ...) => ReturnType` from function declarations and arrow functions. Includes type parameters, optional params, and omits missing annotations rather than inferring.
- **`extractClassSignature`** — Extracts `class Name extends Base implements Iface { constructor(param: Type) }`. Heritage clauses + constructor params only, no method signatures.
- **`extractInterfaceSignature`** — Extracts `interface Name extends Base`. Extends clause only, no property/method signatures.

### Design Decisions
- **Surface syntax only** — types are extracted as written in source (`GraphStore`, not resolved paths)
- **Omit rather than infer** — missing annotations produce `(x)` not `(x: any)`
- **Undefined, not empty string** — nodes without signatures (e.g. modules) have no `signature` key
- **No new dependencies** — uses existing tree-sitter parser

## Files Changed

| File | Change |
|------|--------|
| `src/graph/types.ts` | Added `signature?: string` to `GraphNode` |
| `src/graph/sqlite.ts` | Migration, addNode, hydrateNode, all SELECT queries |
| `src/indexer/tree-sitter.ts` | `addNode` helper, 3 extraction helpers, all node handlers |
| `test/indexer-extract-file.test.ts` | Updated existing assertions for new field |
| `test/signature-schema.test.ts` | Schema + migration tests |
| `test/signature-round-trip.test.ts` | SQLite round-trip through all query paths |
| `test/signature-extract-function.test.ts` | 6 function signature cases |
| `test/signature-extract-arrow.test.ts` | 4 arrow function cases |
| `test/signature-extract-class.test.ts` | 5 class signature cases |
| `test/signature-extract-interface.test.ts` | 4 interface cases |
| `test/signature-extract-generics.test.ts` | 4 generic type parameter cases |
| `test/signature-extract-module.test.ts` | Module node has no signature |

## Test Results

301 tests pass, 0 failures (270 original + 31 new). TypeScript type check clean.
