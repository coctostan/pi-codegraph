# Task 009 Implementation Log

## Changes
- Updated `test/indexer-index-project.test.ts` to add incremental behavior coverage:
  - unchanged files are skipped on subsequent runs
  - changed files are delete+reindexed
  - updated file hash and function-node replacement are verified
- Updated `src/indexer/pipeline.ts` to support incremental indexing:
  - compare current file hash with `store.getFileHash(rel)`
  - `skipped++` and continue when unchanged
  - `store.deleteFile(rel)` before reindexing changed files
  - keep `indexed/errors` accounting and write new hash after indexing

## TDD
- RED: targeted test failed on second run expectations (`indexed`/`skipped` mismatch).
- GREEN: targeted test passed after implementing hash comparison + delete/reindex.
- Regression: `bun test` passed.
