# Task 001 Apply Notes

## Completed
- Added deterministic suggestion rendering support via `GraphQueryError.suggestion` and `formatGraphQueryError()`.
- Added concrete suggestions for unsupported forms in `rejectUnsupported()`.
- Updated `graphQuery()` error rendering to use shared formatter.
- Added test coverage for ORDER BY unsupported suggestion behavior.

## Verification
- RED: `bun test test/tool-graph-query-unsupported-suggestion.test.ts` (failed on missing suggestion text)
- GREEN: `bun test test/tool-graph-query-unsupported-suggestion.test.ts` (pass)
- Regression: `bun test` (all pass)
