# Task 006 Apply Notes

## Completed
- Added compiler support for `STARTS WITH` predicates.
- `STARTS WITH` now compiles to `LIKE ?` with `value%` parameter binding.
- Added compiler test to validate SQL and params.

## Verification
- RED: `bun test test/graph-query-compiler-starts-with.test.ts` (expected `LIKE`, got `=`)
- GREEN: `bun test test/graph-query-compiler-starts-with.test.ts` (pass)
- Regression: `bun test` (all pass)
