# Code Review Report

## Files Reviewed

**New files:**
- `src/output/trust.ts` — shared trust header formatter (types, status resolver, header renderer)
- `test/output-trust-header.test.ts` — unit test for trust module
- `test/tool-symbol-graph-trust-header.test.ts` — trust header integration for symbol_graph
- `test/tool-impact-trust-header.test.ts` — trust header integration for impact
- `test/tool-trace-trust-runtime.test.ts` — trust header integration for coverage-backed trace
- `test/tool-trace-trust-heuristic.test.ts` — trust header integration for static trace
- `test/tool-graph-query-trust-header.test.ts` — trust header integration for graph_query

**Modified files:**
- `src/tools/symbol-graph.ts` — added trust header to all return paths
- `src/tools/impact.ts` — added trust header to all return paths
- `src/tools/trace.ts` — added trust header to both coverage and static paths; `formatLiveTraceLine` return type changed from `string` to `{ line, stale }`
- `src/tools/graph-query.ts` — added trust header to all return paths
- `src/tools/graph-query-render.ts` — added `renderGraphQueryResult` returning `{ text, hasLocalExceptions }`; kept backward-compatible `renderGraphQueryRows` wrapper
- `test/extension-impact.test.ts` — updated assertions for trust header prefix
- `test/tool-impact-output-signals.test.ts` — updated assertions for trust header prefix
- `test/tool-impact-performance.test.ts` — updated assertions for trust header prefix
- `test/tool-trace-signals.test.ts` — updated line index for mode header
- `test/tool-trace-static-mode-header.test.ts` — updated line indices + fixed stale content hashes to use real sha256

## Strengths

1. **Clean single-responsibility module** (`src/output/trust.ts`): The trust module is ~50 lines, exports exactly 4 functions, and has well-typed interfaces. All tools funnel through the same `prependTrustHeader` call — no copy-paste variants.

2. **Backward-compatible render refactor** (`src/tools/graph-query-render.ts:67-73`): The new `renderGraphQueryResult` returns structured `{ text, hasLocalExceptions }` while `renderGraphQueryRows` is kept as a thin wrapper. Existing render tests continue to work unmodified.

3. **Local exception detection is well-scoped**: Each tool computes `hasLocalExceptions` from its own domain logic (agent edge staleness in symbol_graph, anchor staleness in impact, trace step hash mismatches in trace, node anchor staleness in graph_query). This avoids false positives and respects each tool's semantics.

4. **`formatLiveTraceLine` return type upgrade** (`src/tools/trace.ts:82-90`): Changed from returning bare `string` to `{ line, stale }` to enable stale aggregation for the heuristic trust status. Clean refactor that carries stale state properly.

5. **Test quality**: Each trust-header test covers both fresh and stale/mixed scenarios in the same test, asserting both the header content AND that row-level markers appear/don't appear as expected. The `test/tool-trace-static-mode-header.test.ts` fix to use real `sha256Hex` hashes is a good correction that prevents false staleness.

## Findings

### Critical
None.

### Important
None.

### Minor

1. **`collectEvidenceSources` uses indexOf-based dedup** (`src/output/trust.ts:14-16`): The `.filter((value, index, all) => all.indexOf(value) === index)` pattern is O(n²). With typical edge provenance sets (3-5 unique sources), this is negligible, but a `Set`-based approach would be idiomatic. Not worth changing — the input is always tiny.

2. **`renderGraphQueryRows` is now only used by tests** (`src/tools/graph-query-render.ts:67-73`): The main tool code switched to `renderGraphQueryResult`. The wrapper exists solely for 4 existing render tests. This is fine for backward compatibility but could be noted for eventual cleanup.

## Recommendations

1. **Consider exporting `TrustHeaderContext` for extension use**: If pi extensions ever want to build custom tool output with trust headers, the context type will need to be importable. Currently it's exported from `trust.ts` which is sufficient.

2. **Future: evidence source dedup could be more robust**: If a provenance source name ever contains special characters, the comma-join format could be ambiguous. Current sources (`tree-sitter`, `lsp`, `coverage`, `agent`, `ast-grep`, `git`) are all safe. Not worth addressing now.

## Assessment
**ready**

The implementation is clean, well-tested, and follows codebase conventions. All four tools use the shared trust module consistently. The `formatLiveTraceLine` return type change and `renderGraphQueryResult` addition are well-structured refactors. No correctness issues, no unnecessary complexity, no dead code beyond the intentionally-kept backward-compatible wrapper. 215/215 tests pass.
