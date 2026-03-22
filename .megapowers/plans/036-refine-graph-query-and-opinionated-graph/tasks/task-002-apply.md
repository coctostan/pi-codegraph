# Task 002 Apply Notes

## Completed
- Added deterministic suggestions for invalid WHERE parse errors.
- Added deterministic suggestions for invalid node/edge projection properties.
- Added tests covering both parse_error and validation_error suggestion outputs.

## Verification
- RED: `bun test test/tool-graph-query-invalid-suggestion.test.ts` (failed on missing suggestion text)
- GREEN: `bun test test/tool-graph-query-invalid-suggestion.test.ts` (pass)
- Regression: `bun test` (all pass)
