# Result-scoped freshness and staleness reporting

## Summary

Issue #086 adds result-scoped freshness reporting to the three public graph-backed tools: `symbol_graph`, `impact`, and `trace`. The goal is to make every result tell agents whether the returned nodes, edges, and trace steps still match the current working tree before the agent relies on the output for edits.

Previously, trust output was based on broad project state and legacy multi-line trust headers. That made it hard to distinguish a stale target symbol from stale context that happened to appear in the result. The new implementation evaluates only the target and returned result items for each tool invocation.

## Public API signatures confirmed from source

- `evaluateFreshness(params: FreshnessEvaluationParams) => FreshnessReport`
- `symbolGraph(params: SymbolGraphParams) => string`
- `impact(params: { symbols: string[]; changeType: ChangeType; store: GraphStore; projectRoot: string; maxDepth?: number; }) => string`
- `trace(params: TraceParams) => string`

The public tool set is unchanged: `symbol_graph`, `impact`, and `trace` remain the registered read-only tools.

## What changed

### Shared evaluator

A new `src/output/freshness.ts` module provides a shared typed freshness report with status:

- `fresh`
- `partial`
- `stale`
- `unknown`

The evaluator checks:

- returned node hashes against current source-file hashes
- missing/deleted source files
- returned edge provenance hashes against the source node's file hash
- unresolved trace items
- deterministic indexed timestamps when available

Fresh reports render as a single compact line:

```text
Trust: fresh
```

Degraded reports render actionable detail lines, for example:

```text
Trust: partial
- changed files: src/caller.ts (indexed_at: 123)
- affected symbols: caller, shared
- stale edges: 1
- recommendation: impact may be incomplete; refresh index before relying on this result
```

### `symbol_graph`

`symbolGraph(params: SymbolGraphParams) => string` now evaluates freshness over the returned symbol card or visible neighborhood rows.

Important behavior:

- target symbol stale => `Trust: stale`
- target fresh but returned neighborhood evidence stale => `Trust: partial`
- omitted neighbors outside render limits do not affect the freshness status
- existing row-level `[stale]` markers remain present

### `impact`

`impact(...) => string` now passes returned dependent nodes and the dependency edges that discovered them into the shared evaluator.

When stale returned dependencies or dependency edges may make blast-radius results incomplete, output includes:

```text
- recommendation: impact may be incomplete; refresh index before relying on this result
```

`collectImpact(params: CollectImpactParams): ImpactItem[]` remains shape-compatible; the new edge provenance is carried internally via `ImpactDetail` and stripped from the public `ImpactItem[]` helper output.

### `trace`

`trace(params: TraceParams) => string` now evaluates freshness for:

- stored coverage trace steps
- unresolved stored coverage steps
- deleted trace-step files
- stale static call edges in heuristic mode

When the execution path may be unreliable, output includes:

```text
- recommendation: trace path may be unreliable; refresh index before relying on this result
```

Coverage and static mode headers also keep local stale markers, such as:

```text
mode: coverage [stale]
mode: static (heuristic, no runtime evidence) [stale]
```

### `suppressTrustHeader`

`suppressTrustHeader: true` now strips both compact freshness headers and legacy trust blocks through `src/output/read-only-ceremony.ts` while preserving:

- body anchors
- provenance labels
- signal badges
- row-level `[stale]` markers
- indexing-failed notes
- dev metadata footer behavior

## Files changed

Primary implementation files:

- `src/output/freshness.ts`
- `src/output/read-only-ceremony.ts`
- `src/tools/symbol-graph.ts`
- `src/tools/impact.ts`
- `src/tools/trace.ts`

Primary tests:

- `test/output-freshness-evaluator.test.ts`
- `test/output-compact-freshness-ceremony.test.ts`
- `test/tool-symbol-graph-freshness-report.test.ts`
- `test/tool-impact-freshness-warning.test.ts`
- `test/tool-trace-freshness-warning.test.ts`
- `test/tool-trace-static-edge-freshness.test.ts`
- extension suppress-header regression tests for all three public tools

## Verification

Fresh verification for this issue passed:

```text
bun test && bun run check

437 pass
0 fail
1271 expect() calls
Ran 437 tests across 178 files
$ tsc --noEmit
```

A focused freshness regression suite also passed:

```text
32 pass
0 fail
123 expect() calls
Ran 32 tests across 15 files
```
