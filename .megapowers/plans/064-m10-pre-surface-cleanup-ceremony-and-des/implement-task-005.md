# Implement Task 005

Completed Task 5: Normalize the `graph_query` description.

## Changes
- Replaced `test/extension-graph-query-description.test.ts` with the approved description assertion from the plan, including a guard against inline example text.
- Updated the `graph_query` tool registration in `src/index.ts` to use the approved normalized description string.

## TDD Log
- RED: `bun test test/extension-graph-query-description.test.ts` failed with `error: graph_query description mismatch: Execute a Cypher subset query against the graph.` followed by the old inline example block.
- GREEN: `bun test test/extension-graph-query-description.test.ts` passed.
- REGRESSION: `bun test && bun run check` passed.
