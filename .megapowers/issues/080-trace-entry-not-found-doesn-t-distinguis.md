---
id: 80
type: bugfix
status: done
created: 2026-04-20T10:32:55.993Z
priority: 3
---
# trace: "Entry not found" doesn't distinguish symbol-absent vs symbol-not-an-entry-point
## Problem

`trace("runPipeline")` returns:

```
Entry "runPipeline" not found
```

This message is identical whether:
1. The symbol doesn't exist in the graph at all
2. The symbol exists but has no outbound edges (not a meaningful entry point)
3. The name is ambiguous across files

An agent can't tell whether to check spelling, add a `file:` param, or accept that the symbol is internal and not traceable.

## Current code

`trace` (src/tools/trace.ts:103) calls `resolveUniqueSymbol` which already returns `kind: "not_found"` vs `kind: "ambiguous"`. The ambiguous case is handled (routes to "Multiple matches" output). But the not-found path uses the generic `notFoundLabel` string "Entry".

## Fix

In `src/tools/trace.ts`, after `resolveUniqueSymbol` returns `not_found`, attempt a secondary lookup using the bare `store.findNodes(name)` (without `file`). 

- If that also returns nothing → "Symbol 'X' not found in the graph — check spelling or re-index"
- If it returns results (symbol exists but wasn't resolved with the file filter) → suggest disambiguation
- Keep the `ambiguous` branch as-is (it already shows file options)

Also: the current "Entry not found" label is misleading — `trace` doesn't require the symbol to be an "entry point" in the architectural sense. Rename to "Symbol" in the not-found message for clarity.

## Acceptance criteria

- `trace("runPipeline")` → "Symbol 'runPipeline' not found in the graph"
- `trace("walk")` → "Multiple matches..." (existing behaviour preserved)
- `trace("walk", file: "src/indexer/tree-sitter.ts")` → valid trace (no change)
- No regression in test/tool-trace-ambiguous.test.ts
