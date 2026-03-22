# Task 003 Apply Notes

## Completed
- Extended WHERE predicate AST to preserve `CONTAINS` operator.
- Updated WHERE parser to accept `=` and `CONTAINS` with quoted values.
- Added parser test covering CONTAINS + LIMIT behavior.

## Verification
- RED: `bun test test/graph-query-parser-contains.test.ts` (parse_error on CONTAINS)
- GREEN: `bun test test/graph-query-parser-contains.test.ts` (pass)
- Regression: `bun test` (all pass)
