# Feature: Inline source snippets in symbol_card output

## Summary

`symbol_card` now inlines the target symbol's full source definition and neighbor type signatures directly in its output, eliminating the need for follow-up `read()` calls. A `maxSourceLines` parameter (default: 50) caps output size for large symbols.

## What changed

### New `### Source` section
The `symbol_card` tool output now includes a `### Source` section between the header/anchor and Signature. Source lines are rendered in pi's hashline anchor format (`LINE:HASH|content`), so agents can use anchors directly with `edit` — no round-trip needed.

### Graceful degradation
- Missing file on disk → `source unavailable`
- Null `end_line` on graph node → `source unavailable`  
- Content hash mismatch → `### Source [stale]` marker with source still shown

### Neighbor signatures
The Key Relationships section now shows type signatures for each listed neighbor (top 5 per group). Neighbors without a stored signature show no extra line — no noise.

### New parameter
`maxSourceLines` (optional number, default 50) — controls how many lines of the target symbol's source are included. Excess lines are truncated with a `(N more lines truncated)` indicator.

## Files

| File | Change |
|------|--------|
| `src/output/source.ts` | New — `readSourceSnippet` utility |
| `src/tools/symbol-card.ts` | Modified — Source section, neighbor sigs, `maxSourceLines` param |
| `src/index.ts` | Modified — Typebox schema for `maxSourceLines` |
| `test/read-source-snippet.test.ts` | New — 6 tests for utility |
| `test/tool-symbol-card-source.test.ts` | New — 5 tests for source section |
| `test/tool-symbol-card-neighbor-sigs.test.ts` | New — 2 tests for neighbor signatures |

## Why

Previously, `symbol_card` returned anchors but no code — agents had to `read()` each file separately. This turned a single-call workflow into a multi-step chain. Now agents get definition + context in one call, reducing token waste and round-trips.
