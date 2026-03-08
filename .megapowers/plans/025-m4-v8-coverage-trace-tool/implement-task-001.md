# Implement Task 001 — Add deterministic V8 coverage parser

## RED
- Added test: `test/indexer-coverage-parser.test.ts`
- Ran: `bun test test/indexer-coverage-parser.test.ts`
- Observed expected failure:
  - `Cannot find module '../src/indexer/coverage.js' from 'test/indexer-coverage-parser.test.ts'`

## GREEN
- Added implementation: `src/indexer/coverage.ts`
- Initial run exposed end-line mismatch (3/7 vs expected 4/8)
- Applied minimal fix to line counting for `endLine` to use `endOffset`
- Re-ran: `bun test test/indexer-coverage-parser.test.ts`
- Result: pass

## Regression check
- Ran: `bun test`
- Result: `127 pass, 0 fail`
