# Implement Progress

## Completed in this session

### Task 1 — Add deterministic V8 coverage parser
- Added `test/indexer-coverage-parser.test.ts`
- Added `src/indexer/coverage.ts` with deterministic parsing and sorting
- Fixed `endLine` normalization to align with expected inclusive line mapping behavior

### Task 2 — Map coverage ranges to graph nodes
- Added `test/indexer-coverage-mapping.test.ts`
- Extended `src/indexer/coverage.ts` with:
  - `MappedCoverageRecord`
  - `mapCoverageToNodes(store, records)`
  - deterministic overlap resolution (smallest span wins)

### Task 3 — Persist coverage-backed test traces in SQLite
- Added `test/graph-store-coverage-traces.test.ts`
- Extended `src/graph/store.ts` with `TestTraceStep`, `TestTraceRecord`, `saveTestTrace`, `getTestTrace`
- Extended `src/graph/sqlite.ts` with `test_trace_steps` schema and persistence/read APIs
- Updated `deleteFile` cleanup to remove trace rows touching deleted file nodes
- Fixed regression in `test/graph-types.typecheck.ts` by adding stubbed `saveTestTrace`/`getTestTrace` in `validStore`

## Verification snapshots
- Task 1 target: pass
- Task 2 target: pass
- Task 3 target: pass
- Full suite after Task 3 + regression fix: `129 pass, 0 fail`
