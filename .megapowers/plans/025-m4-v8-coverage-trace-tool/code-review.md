# Code Review — 025-m4-v8-coverage-trace-tool

## Files Reviewed
- `src/indexer/coverage.ts` — New: V8 coverage parser, node mapping, stage 4 indexer
- `src/tools/trace.ts` — New: trace tool with coverage-backed and static fallback modes
- `src/graph/sqlite.ts` — Modified: added `test_trace_steps` table, `saveTestTrace`/`getTestTrace`, trace cleanup in `deleteFile`, reformatted SQL
- `src/graph/store.ts` — Modified: added `TestTraceStep`, `TestTraceRecord` interfaces and store methods
- `src/index.ts` — Modified: registered `impact` and `trace` tools
- `src/indexer/pipeline.ts` — Modified: wired coverage stage, added `.tsx` support to file walker
- `test/graph-store-coverage-traces.test.ts` — New: store-level trace persistence tests
- `test/indexer-coverage-parser.test.ts` — New: coverage parsing tests
- `test/indexer-coverage-mapping.test.ts` — New: coverage-to-node mapping tests
- `test/indexer-coverage-stage.test.ts` — New: end-to-end coverage indexing tests
- `test/tool-trace-coverage.test.ts` — New: trace tool coverage-backed mode tests
- `test/tool-trace-endpoint.test.ts` — New: trace tool endpoint resolution tests
- `test/tool-trace-stale.test.ts` — New: trace tool staleness tests
- `test/tool-trace-static-fallback.test.ts` — New: trace tool static fallback tests
- `test/extension-wiring.test.ts` — Modified: added trace tool registration test
- `test/graph-types.typecheck.ts` — Modified: added new store methods to type-check fixture
- `test/tool-symbol-graph-lsp.test.ts` — Modified: improved test hermeticity with fake tsserver

## Strengths
- **Clean separation of concerns**: parsing (`parseCoverageReports`), mapping (`mapCoverageToNodes`), and stage orchestration (`runCoverageIndexStage`) are well-factored and independently testable (coverage.ts:37, 122, 144).
- **Deterministic ordering throughout**: every sort uses stable multi-key comparators with `localeCompare` and numeric tiebreakers. The spec demanded determinism and the implementation delivers it (coverage.ts:100-106, 129, 137-141, 160, 163; trace.ts:18, 51).
- **Robust error handling in parser**: double try/catch around JSON parsing and per-entry processing with `continue` means one malformed file doesn't abort the whole run (coverage.ts:47-51, 54, 94-96).
- **Correct staleness detection**: stored content hashes compared against current node hashes in `formatStoredTraceLine` gives accurate stale marking without re-reading files (trace.ts:64).
- **Unresolved step handling**: missing nodes gracefully produce `unresolved [stale]` instead of crashing (trace.ts:60-61).
- **Good test coverage**: 9 new test files covering parser, mapper, stage, store, tool coverage/static/stale/endpoint modes, plus wiring. Tests use real SQLite stores and tmp directories — not over-mocked.
- **Transaction safety**: `saveTestTrace` and `deleteFile` properly use BEGIN/COMMIT/ROLLBACK (sqlite.ts:198-210, 193-205).
- **Consistent with codebase**: follows the same patterns as existing tools (symbol_graph, impact, resolve_edge) for store usage, output formatting, and extension registration.

## Findings

### Critical
None

### Important
All important findings have been fixed (see below).

### Minor

1. **`parseCoverageReports` only takes first covered range** — `coverage.ts:72-76`: `ranges.find(...)` picks only the first range with count > 0. V8 coverage can emit multiple ranges per function (e.g., branching). This is fine for v1 but worth a comment noting the simplification.

2. **Test/production heuristic is filename-based** — `coverage.ts:159,162`: The test detection uses `.test.ts`/`.spec.ts` suffix OR `node.kind === "test"`. This means a production function defined in a test file would be classified as a test. Acceptable for v1 but a known limitation.

3. **`buildStaticTrace` follows only first callee** — `trace.ts:50-52`: The static fallback takes the first callee after sorting, producing a single linear path. This is by design (spec says "one trace only") but means fork points are silently ignored rather than annotated. Fine for v1.

4. **Reformatted `sqlite.ts`** — The diff includes a large reformatting of existing code (collapsing multi-line SQL to single lines, removing comments). The collapsed SQL strings are now very long single lines. Not a blocker but reduces readability of the SQL.

## Fixes Applied

1. **`created_at` misuse in coverage edges** — `coverage.ts:177`: Changed `created_at: testRecord.startLine` to `created_at: Date.now()`. Was using a line number as a timestamp, inconsistent with all other edges in the codebase.

2. **Repeated file reads in parser** — `coverage.ts:63-65`: Added `Map<string, string>` cache (`fileContentCache`) to avoid reading the same source file multiple times when a coverage report references many functions from the same file.

3. **Missing trailing newline** — `test/extension-wiring.test.ts`: Added EOF newline.

## Recommendations
- Consider adding an index on `test_trace_steps.node_id` if traces grow large — currently only `(test_node_id, ordinal)` is indexed via the PK.
- The coverage stage runs on every `indexProject` call even when no coverage files changed. A file-hash check on the coverage directory could skip redundant work.

## Assessment
**ready**

All important issues have been fixed. Tests pass (136/136, 0 failures). Type check clean. The implementation is well-structured, correctly handles all spec criteria, and follows codebase conventions.
