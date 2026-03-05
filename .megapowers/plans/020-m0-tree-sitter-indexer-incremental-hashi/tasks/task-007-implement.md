# Task 007 Implementation Log

## Changes
- Added `listFiles(): string[]` to the `GraphStore` interface in `src/graph/store.ts`.
- Implemented `SqliteGraphStore.listFiles()` in `src/graph/sqlite.ts` by selecting file paths from `file_hashes` ordered ascending.
- Added `test/graph-store-list-files.test.ts` to verify listing behavior and deletion reflection via `deleteFile()`.

## TDD
- RED: `bun test test/graph-store-list-files.test.ts` failed with `TypeError: store.listFiles is not a function`.
- GREEN: `bun test test/graph-store-list-files.test.ts` passes after implementation.
- Regression: `bun test` passes.
