# Implement Task 004

Completed Task 4: Normalize the `trace` description.

## Changes
- Replaced `test/extension-trace-description.test.ts` with the approved description assertion from the plan.
- Updated the `trace` tool registration in `src/index.ts` to use the approved normalized description text.

## TDD Log
- RED: `bun test test/extension-trace-description.test.ts` failed with `error: trace description mismatch: Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.`
- GREEN: `bun test test/extension-trace-description.test.ts` passed.
- REGRESSION: `bun test && bun run check` passed.
