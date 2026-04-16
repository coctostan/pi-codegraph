# Implement Task 006

Completed Task 6: Normalize the remaining tool descriptions.

## Changes
- Added `test/extension-tool-descriptions.test.ts` to assert the approved descriptions across all 11 registered tools.
- Replaced the first test in `test/extension-symbol-search.test.ts` with the approved description assertion while keeping the execution test intact.
- Updated the remaining tool description strings in `src/index.ts` for `symbol_graph`, `resolve_edge`, `delete_edge`, `impact`, `symbol_card`, `symbol_contract`, `graph_overview`, `dead_code`, and `symbol_search`.

## TDD Log
- RED: `bun test test/extension-tool-descriptions.test.ts test/extension-symbol-search.test.ts` failed with `error: description mismatch for symbol_graph: Look up a symbol and return its anchored neighborhood` and `error: symbol_search description mismatch: Search symbols by approximate name using BM25 ranked scoring. Tokenizes camelCase/snake_case queries and scores against symbol name, signature, and file path.`
- GREEN: `bun test test/extension-tool-descriptions.test.ts test/extension-symbol-search.test.ts` passed.
- REGRESSION: `bun test && bun run check` passed.
