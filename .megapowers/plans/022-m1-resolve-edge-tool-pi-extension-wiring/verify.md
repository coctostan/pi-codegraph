# Verify — 022-m1-resolve-edge-tool-pi-extension-wiring

## Test Results

```
bun test v1.3.9 (cf6cdbbb)

 59 pass
 0 fail
 223 expect() calls
Ran 59 tests across 18 files. [101.00ms]
```

All 59 tests pass across 18 test files.

## Tasks Completed

### Task 9: symbolGraph marks stale agent edges in output
- Added `isAgentEdgeStale()` to `src/tools/symbol-graph.ts` — compares edge `provenance.content_hash` against `store.getFileHash(sourceNode.file)`
- Passed `store` into `toAnchoredNeighbor` and `buildSection` to enable the staleness check
- Stale agent edges get `anchor.stale = true`, which triggers the existing `[stale]` rendering in `formatSection`
- **New test:** `test/tool-symbol-graph-stale-agent.test.ts`

### Task 10: Pi extension registers symbol_graph tool with TypeBox schema
- Updated `src/index.ts` to import `Type` from `@sinclair/typebox` and register `symbol_graph` with `name` (required) and `file` (optional)
- **New test:** `test/extension-wiring.test.ts`

### Task 11: Pi extension registers resolve_edge tool with TypeBox schema
- Extended `src/index.ts` to also register `resolve_edge` with `source`, `target`, `kind`, `evidence` (required) and `sourceFile`, `targetFile` (optional)
- Updated `test/extension-wiring.test.ts` with second test

### Task 12: Extension auto-indexes when store is empty and shares singleton store
- Wired full implementation in `src/index.ts`: singleton `sharedStore`, `getOrCreateStore()` opens SQLite at `<cwd>/.codegraph/graph.db`, `ensureIndexed()` calls `indexProject` when store is empty
- Exported `getSharedStoreForTesting()` and `resetStoreForTesting()` for test isolation
- Both tools now route to real `symbolGraph` / `resolveEdge` implementations
- **New test:** `test/extension-auto-index.test.ts`

## Files Changed

- `src/tools/symbol-graph.ts` — stale agent edge detection
- `src/index.ts` — full pi extension wiring with singleton store and auto-indexing
- `test/tool-symbol-graph-stale-agent.test.ts` — new
- `test/extension-wiring.test.ts` — new
- `test/extension-auto-index.test.ts` — new
