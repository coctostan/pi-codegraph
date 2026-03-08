# M4: V8 Coverage Ingestion & Trace Tool

## Summary

Milestone 4 adds two major capabilities to pi-codegraph: **Stage 4 V8 coverage indexing** and the **`trace` tool**. Together they let coding agents retrieve deterministic, hashline-anchored execution paths from any test, production symbol, or endpoint — backed by real V8 coverage data when available, with automatic fallback to static call-graph traversal.

## What Was Built

### Stage 4 Indexer: V8 Coverage → `tested_by` Edges + Traces

**`src/indexer/coverage.ts`** — A three-layer coverage pipeline:

1. **Parser** (`parseCoverageReports`) — Reads all `.json` files from a configurable coverage directory, normalizes V8 coverage entries into `NormalizedCoverageRecord` objects with file-relative paths and line numbers. Filters out non-project, non-TypeScript, and malformed entries. Produces deterministic output via multi-key sorting.

2. **Mapper** (`mapCoverageToNodes`) — Resolves each coverage range to the best-matching graph node by file + line overlap, preferring the smallest-span node. Drops unresolvable ranges.

3. **Stage orchestrator** (`runCoverageIndexStage`) — Groups mapped records by report file, classifies them as test or production, then:
   - Creates `tested_by` edges (provenance: `coverage`) from each production symbol to covering test symbols
   - Persists ordered `TestTraceRecord` per test symbol with content hashes for staleness detection

**`src/graph/sqlite.ts`** — New `test_trace_steps` table with `saveTestTrace`/`getTestTrace` methods. Trace cleanup integrated into `deleteFile` transactions.

**`src/indexer/pipeline.ts`** — Wired Stage 4 after ast-grep stage with configurable `coverageDir` option.

### `trace` Tool

**`src/tools/trace.ts`** — Given an entry point (test, function, or endpoint), returns one deterministic anchored execution path:

- **Test symbols** → directly look up their stored coverage-backed trace
- **Production symbols** → find covering tests via `tested_by` edges, pick first alphabetically
- **Endpoints** → follow `routes_to` edges to handlers, then apply production symbol logic
- **No coverage** → fall back to deterministic static call-graph traversal (`calls` edges)

Output includes `mode: coverage` or `mode: static` header, hashline anchors for every step, and `[stale]`/`unresolved` markers when content has changed since indexing.

**`src/index.ts`** — Registered as `trace` tool in the pi extension with `entry` (required) and `file` (optional) parameters.

## Key Design Decisions

- **Coverage-backed traces preferred over static** — real execution data is more accurate
- **One trace per request** — deterministic selection (alphabetical test ID) avoids ambiguity
- **Staleness via content hash** — each trace step stores the content hash at index time; mismatches are flagged without failing the trace
- **Unresolved steps gracefully degrade** — missing nodes become `unresolved [stale]` rather than errors
- **File content caching** in parser avoids redundant reads for multi-function files

## Files Changed

| File | Change |
|------|--------|
| `src/indexer/coverage.ts` | New — parser, mapper, stage orchestrator |
| `src/tools/trace.ts` | New — trace tool |
| `src/graph/sqlite.ts` | Modified — test_trace_steps table, save/get/cleanup |
| `src/graph/store.ts` | Modified — TestTraceStep, TestTraceRecord interfaces |
| `src/index.ts` | Modified — trace + impact tool registration |
| `src/indexer/pipeline.ts` | Modified — Stage 4 wiring, .tsx support |
| `test/` (9 new files) | Coverage parser, mapping, stage, store, trace tool tests |

## Test Coverage

136 tests across 39 files, 0 failures. 12 feature-specific tests covering all 19 acceptance criteria with evidence from real SQLite stores and temp directories.
