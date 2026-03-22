# Feature: Shared Trust/Freshness Header for Graph Tools

## Summary

Added a compact, shared trust/freshness header to all four read-oriented graph tools (`symbol_graph`, `trace`, `impact`, `graph_query`) so an agent can immediately determine output reliability without scanning every row.

## Motivation

Previously, agents had to inspect individual `[stale]` markers across result rows to assess output trustworthiness. There was no top-level signal indicating whether the graph data backing a response was fresh, stale, heuristic-only, or runtime-backed. This made it difficult for agents to make quick trust decisions about tool output.

## What Changed

### New: `src/output/trust.ts`
A shared trust module providing:
- `resolveTrustStatus()` — computes one of five statuses: `fresh`, `stale`, `mixed`, `heuristic`, `runtime-backed`
- `formatTrustHeader()` — renders a fixed 3-line header: `## Trust`, `status: <status>`, `evidence: <sources>  stale-files: N/M`
- `prependTrustHeader()` — prepends the header to any tool body output
- `collectEvidenceSources()` — extracts unique provenance sources from graph statistics

### Modified: All four read-oriented tools
- `src/tools/symbol-graph.ts` — prepends trust header on all return paths (not found, ambiguous, single match)
- `src/tools/impact.ts` — prepends trust header; tracks local stale exceptions from anchor checks
- `src/tools/trace.ts` — prepends trust header with mode-aware status (`runtime-backed` for coverage, `heuristic` for static); upgraded `formatLiveTraceLine` to return `{ line, stale }` for proper aggregation
- `src/tools/graph-query.ts` — prepends trust header; delegates stale detection to `renderGraphQueryResult`
- `src/tools/graph-query-render.ts` — added `renderGraphQueryResult` returning `{ text, hasLocalExceptions }`; kept backward-compatible `renderGraphQueryRows` wrapper

### Not modified
- `src/tools/resolve-edge.ts` — write-oriented tool, intentionally excluded
- `src/indexer/*` — no new indexing stages; trust is derived from existing `getStatistics()`

## Design Decisions

1. **Single shared module**: All tools call the same `prependTrustHeader()` function, guaranteeing identical field order, labels, and status vocabulary.
2. **3-line bounded header**: The header is always exactly 3 lines regardless of graph size, avoiding per-row trust repetition.
3. **Local exceptions preserved**: Row-level `[stale]` markers remain alongside the header for granular inspection.
4. **No timestamps**: The header deliberately excludes `indexed-at` / recency timestamps per spec requirement.
5. **Backward-compatible render wrapper**: `renderGraphQueryRows` kept as thin wrapper over new `renderGraphQueryResult` so existing render tests remain unmodified.

## Test Coverage

- `test/output-trust-header.test.ts` — unit tests for all five trust statuses and header formatting
- `test/tool-symbol-graph-trust-header.test.ts` — fresh/mixed scenarios for symbol_graph
- `test/tool-impact-trust-header.test.ts` — fresh/stale scenarios for impact
- `test/tool-trace-trust-runtime.test.ts` — runtime-backed/mixed scenarios for coverage trace
- `test/tool-trace-trust-heuristic.test.ts` — heuristic status for static trace
- `test/tool-graph-query-trust-header.test.ts` — fresh/mixed scenarios for graph_query
- Updated 6 existing test files to account for trust header prefix

**Total: 215 tests passing, 0 failures.**
