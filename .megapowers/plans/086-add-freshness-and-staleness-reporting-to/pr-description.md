## Summary

Adds result-scoped freshness and staleness reporting to the public graph-backed tools (`symbol_graph`, `impact`, and `trace`) so agents can tell whether a returned result still matches the working tree before relying on it.

Fresh results now start with a compact header:

```text
Trust: fresh
```

Degraded results now report actionable details, including changed/deleted files, affected symbols when derivable, stale edge counts, and tool-specific refresh recommendations.

## What changed

- Added a shared `evaluateFreshness(params: FreshnessEvaluationParams) => FreshnessReport` evaluator.
- Replaced broad/global trust headers with result-scoped compact freshness headers.
- Integrated freshness reporting into:
  - `symbolGraph(params: SymbolGraphParams) => string`
  - `impact(params: { symbols; changeType; store; projectRoot; maxDepth? }) => string`
  - `trace(params: TraceParams) => string`
- Preserved existing row-level `[stale]` markers for stale returned rows and trace steps.
- Added stale dependency/edge warnings for `impact` results that may be incomplete.
- Added unreliable-path warnings for `trace` results with stale coverage steps, deleted files, unresolved stored steps, or stale static call edges.
- Updated `suppressTrustHeader` handling so compact freshness headers are stripped consistently while preserving anchors, provenance labels, signal badges, indexing-failed notes, row-level stale markers, and dev metadata.

## Verification

- `bun test && bun run check`
  - `437 pass`
  - `0 fail`
  - `1271 expect() calls`
  - `tsc --noEmit` completed successfully
- Focused freshness regression suite:
  - `32 pass`
  - `0 fail`

## Notes

This does not add a reindex daemon or broaden the public tool set. Freshness is scoped to each result so omitted neighbors or unrelated stale files do not degrade a tool response.
