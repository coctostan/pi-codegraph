# Task 004 Implement Log

## RED
- Added `test/indexer-coverage-stage.test.ts`
- Ran `bun test test/indexer-coverage-stage.test.ts`
- Confirmed expected failure:
  - `Expected length: 1`
  - `Received length: 0`

## GREEN
- Updated `src/indexer/coverage.ts`
  - Added `runCoverageIndexStage(...)`
  - Grouped mapped coverage by report
  - Writes deterministic `tested_by` edges with `coverage` provenance
  - Persists deterministic per-test traces with `saveTestTrace`
  - Adapted test classification to treat `.test.ts`/`.spec.ts` files as test coverage records when node kind is not `test`
- Updated `src/indexer/pipeline.ts`
  - Added coverage stage import and `coverageDir` option
  - Wired coverage stage execution after ast-grep stage

## Verification
- `bun test test/indexer-coverage-stage.test.ts` => pass
- `bun test` => `131 pass, 0 fail`
