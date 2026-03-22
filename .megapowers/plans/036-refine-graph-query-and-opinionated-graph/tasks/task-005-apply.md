# Task 005 Apply Notes

## Completed
- Extended WHERE predicate AST/operator parsing to include `STARTS WITH`.
- Updated parser regex and operator mapping to preserve `STARTS WITH` in AST.
- Added parser test for STARTS WITH + LIMIT behavior.

## Verification
- RED: `bun test test/graph-query-parser-starts-with.test.ts` (parse_error on STARTS WITH)
- GREEN: `bun test test/graph-query-parser-starts-with.test.ts` (pass)
- Regression: `bun test` (all pass)
