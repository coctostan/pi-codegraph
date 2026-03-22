# Task 007 Apply Notes

## Completed
- Updated WHERE predicate compilation to resolve aliases against both node and edge alias maps.
- Added explicit compiler guard for unbound aliases.
- Added integration-style test to verify edge-alias WHERE filtering executes end-to-end.

## Verification
- RED: `bun test test/tool-graph-query-edge-where.test.ts` (generated `undefined.evidence` and execution error)
- GREEN: `bun test test/tool-graph-query-edge-where.test.ts` (pass)
- Regression: `bun test` (all pass)
