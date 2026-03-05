# Task 010 Implementation Log

## Changes
- Updated `test/indexer-index-project.test.ts` for deletion + read-failure behavior:
  - verifies `removed` increments when a previously indexed file disappears
  - verifies indexing continues when one `.ts` file cannot be read
  - verifies only successfully indexed files remain in `file_hashes`
- Updated `src/indexer/pipeline.ts` to support deleted-file cleanup:
  - added `currentRel` set from discovered files
  - added post-index pass over `store.listFiles()`
  - delete stale files via `store.deleteFile(oldFile)` and increment `removed`
  - increment `errors` if stale-file cleanup throws

## TDD
- RED: targeted test failed on `removed` mismatch (`0` vs expected `1`).
- GREEN: targeted test passed after stale-file deletion pass.
- Regression: `bun test` passed.
