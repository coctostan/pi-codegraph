# Task 5 implementation

Implemented guarded per-match writes for Stage 3 ast-grep indexing.

## Changes
- Added `test/ast-grep-guarded-writes.test.ts`
  - `routes_to`: verifies `addNode(endpointNode)` failure does not abort later matches
  - `renders`: verifies `addEdge` failure does not abort later matches
- Updated `src/indexer/ast-grep.ts`
  - wrapped `store.addNode(endpointNode)` + `store.addEdge(...)` in `applyRoutesToMatches` with try/catch
  - wrapped `store.addEdge(...)` in `applyRendersMatches` with try/catch
  - failure policy: skip current match and continue stage

## Verification
- `bun test test/ast-grep-guarded-writes.test.ts` ✅
- `bun test` ✅
