# Implement Progress (Tasks 4-6)

## Task 4 — Index coverage artifacts into tested_by edges and stored traces
- Added `test/indexer-coverage-stage.test.ts`
- Updated `src/indexer/coverage.ts` with `runCoverageIndexStage(...)`
- Updated `src/indexer/pipeline.ts` to wire coverage stage and `coverageDir` option
- Note: adjusted test-record classification to include `.test.ts` / `.spec.ts` files because extracted test functions are currently `kind: "function"`
- Verification:
  - `bun test test/indexer-coverage-stage.test.ts` ✅
  - `bun test` ✅ (`131 pass, 0 fail` at that point)

## Task 5 — Return coverage-backed traces for tests and production symbols
- Added `test/tool-trace-coverage.test.ts`
- Added `src/tools/trace.ts` (coverage mode for direct test entries and production symbols via deterministic tested_by selection)
- Verification:
  - `bun test test/tool-trace-coverage.test.ts` ✅
  - `bun test` ✅ (`132 pass, 0 fail` at that point)

## Task 6 — Resolve endpoint entries to coverage-backed traces
- Added `test/tool-trace-endpoint.test.ts`
- Updated `src/tools/trace.ts` to resolve endpoint entries via inbound `routes_to` handlers, then apply deterministic coverage trace selection
- Verification:
  - `bun test test/tool-trace-endpoint.test.ts` ✅
  - `bun test` ✅ (`133 pass, 0 fail`)
