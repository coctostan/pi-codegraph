# M8: Contracts and Symbol Cards

## Summary
Milestone M8 delivers verification-grade intelligence to pi-codegraph. Three features turn the graph from a dependency browser into a tool that answers "what does this symbol promise?"

## Features Delivered

### Type Signature Extraction (#048)
- Extended tree-sitter pipeline to capture type signatures for functions, arrow functions, classes, and interfaces
- Added `signature?: string` to `GraphNode` and `signature TEXT` column to SQLite schema
- Signatures are compact normalized strings (e.g. `(store: GraphStore, projectRoot: string) => string`)
- Covers: parameter types, return types, generics, extends/implements clauses, constructor signatures

### `symbol_card` Tool (#049)
- Compact, structured symbol summary in a single call: definition, signature, tests, relationships, signals
- Params: `{ name: string, file?: string }`
- Includes: hashline-anchored definition, type signature, covering tests, callers/callees/imports, hub/tested/bottleneck signals
- Same disambiguation pattern as `symbol_graph`

### `symbol_contract` Tool (#050)
- Behavioral evidence extraction from types and tests
- Extracts: input/return types from signature, thrown errors from function body, early return guards
- Mines test assertions (`toBe`, `toThrow`, `toContain`, `toHaveLength`) from covering test files
- Groups behaviors by test name for context

## Files Added/Modified
- `src/tools/symbol-card.ts` (new)
- `src/tools/symbol-contract.ts` (new)
- `src/indexer/contract-extractor.ts` (new)
- `src/graph/types.ts` — signature field
- `src/graph/sqlite.ts` — schema migration, persistence
- `src/indexer/tree-sitter.ts` — signature extraction
- `src/index.ts` — tool registration
- `ROADMAP.md` — M8 marked complete

## Test Coverage
- 334 tests pass across 147 files
- 27 dedicated M8 tests covering signatures, symbol cards, symbol contracts, and contract extraction
- Edge cases: ambiguous symbols, not-found, no-tests, no-signature, no-body, generics

## What's Deferred
- Doc comment extraction
- Cross-function contract composition
- Invariant inference beyond direct AST/test evidence
