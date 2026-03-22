# Task 004 Apply Notes

## Completed
- Added compiler support for WHERE `CONTAINS` predicates.
- `CONTAINS` now compiles to parameterized `LIKE ?` SQL with `%value%` binding.
- Added compiler test to confirm SQL text and parameterization.

## Verification
- RED: `bun test test/graph-query-compiler-contains.test.ts` (expected `LIKE`, got `=`)
- GREEN: `bun test test/graph-query-compiler-contains.test.ts` (pass)
- Regression: `bun test` (all pass)
