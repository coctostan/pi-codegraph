# Task 008 Implementation Log

## Changes
- Added `test/indexer-index-project.test.ts` with coverage for indexing `.ts` files under root, excluding `node_modules`, and persisting nodes/edges + file hashes.
- Replaced `src/indexer/pipeline.ts` with an initial indexing pipeline implementation:
  - recursive `.ts` file discovery (excluding `node_modules`)
  - per-file extraction via `extractFile`
  - node/edge writes to `GraphStore`
  - file hash persistence
  - index result counters (`indexed`, `skipped`, `removed`, `errors`)
- Added back-compat export `IndexPipeline = indexProject`.

## TDD
- RED: `bun test test/indexer-index-project.test.ts` failed with missing export `indexProject`.
- GREEN: targeted test passed after implementing `indexProject`.
- Regression: `bun test` passed.
