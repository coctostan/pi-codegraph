---
id: 75
type: feature
status: open
created: 2026-04-20T10:32:55.992Z
priority: 2
---
# Trust header: add opt-out flag to suppress repeated headers in multi-tool sessions
## Problem

Every tool call (`symbol_graph`, `trace`, `impact`, `symbolCard`, `symbolContract`) prepends the same trust header:

```
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/183
mode: static (heuristic, no runtime evidence)
```

In a session where an agent makes 6 tool calls, this block appears 6 times and consumes ~80 tokens per call for information that hasn't changed. The trust status only changes when the index is re-run.

## Proposed solution

Add a boolean `suppressTrustHeader` parameter to each tool's params type, defaulted to `false`. When `true`, `prependTrustHeader` (src/output/trust.ts:48) returns `body` unchanged.

Alternative: a session-scoped token in the extension (e.g. a counter or timestamp written to a temp file) so the first call in a process session emits the header and subsequent calls within the same stale-check window suppress it. This avoids requiring callers to manage the flag.

The simpler path is the explicit flag — agents can set it after the first call.

## Location

- `src/output/trust.ts` — `prependTrustHeader(body, context)` — add optional `suppress?: boolean` to `TrustHeaderContext` or as a third param
- `src/tools/symbol-graph.ts`, `src/tools/trace.ts`, `src/tools/impact.ts`, `src/tools/symbol-card.ts`, `src/tools/symbol-contract.ts` — thread the flag through each tool's params
- `src/index.ts` — expose the flag in the pi tool schema for each registered tool

## Acceptance criteria

- Calling `symbol_graph({ ..., suppressTrustHeader: true })` returns output without the `## Trust` block
- Default (`suppressTrustHeader` absent or `false`) behaviour is unchanged
- All 5 tools support the flag
