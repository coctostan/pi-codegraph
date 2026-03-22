# Task 008 Apply Notes

## Completed
- Expanded `graph_query` tool description in extension registration to include concrete, working query examples.
- Added test to assert example presence in registered tool metadata.

## Verification
- RED: `bun test test/extension-graph-query-description.test.ts` (description missing examples)
- GREEN: `bun test test/extension-graph-query-description.test.ts` (pass)
- Regression: `bun test` (all pass)
