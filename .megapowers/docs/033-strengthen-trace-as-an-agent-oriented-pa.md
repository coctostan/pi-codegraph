# Feature: Strengthen `trace` as an Agent-Oriented Path Tool

**Issue:** 033  
**Branch:** `feat/033-strengthen-trace-as-an-agent-oriented-pa`

---

## Summary

Made the `trace` tool more trustworthy for coding agents by making its trust level explicit in both the output header and the tool description. Agents can now distinguish runtime-backed execution paths from static structural heuristics without parsing step content.

---

## Problem

Before this change:

- The `trace` tool emitted `mode: static` for static fallback paths — giving no indication that the path was a heuristic with no runtime evidence, not an observed execution trace.
- The tool description was generic: `"Return one deterministic anchored execution path for a test, symbol, or endpoint"` — it didn't tell agents whether results were reliable, how they were produced, or when to prefer `trace` over `symbol_graph` or `impact`.

An agent receiving a static trace had no structured signal that it should treat the path with lower confidence than a coverage-backed one.

---

## What Changed

### `src/tools/trace.ts`

Added a shared `formatModeHeader(mode, stale?)` helper that produces the first output line for all trace results:

- Coverage-backed: `mode: coverage` (or `mode: coverage [stale]` when the stored trace is stale)
- Static fallback: `mode: static (heuristic, no runtime evidence)`

Both return sites in `trace()` now use this helper, eliminating the possibility of the two header formats drifting apart in future changes.

**Step-line format is unchanged.** `formatLiveTraceLine` and `formatStoredTraceLine` were not modified — the `file:line:hash  name  kind` format is fully backward compatible.

### `src/index.ts`

Updated the trace tool registration description from:
```
"Return one deterministic anchored execution path for a test, symbol, or endpoint"
```
to:
```
"Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow one path, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents."
```

This tells agents:
1. What `trace` returns (deterministic single path)
2. How trustworthy the result is (may be coverage or heuristic)
3. When to use `trace` vs other tools in the graph

---

## Files Changed

| File | Change |
|------|--------|
| `src/tools/trace.ts` | Added `formatModeHeader()` helper; updated both return sites |
| `src/index.ts` | Updated trace tool description |
| `test/tool-trace-static-mode-header.test.ts` | New test: exact static header + step backward compatibility |
| `test/extension-trace-description.test.ts` | New test: trace tool description exact match |

---

## Output Format

```
mode: static (heuristic, no runtime evidence)       ← first line, structured signal
src/app.ts:1:abc123  entry  function                ← step lines, unchanged format
src/app.ts:2:def456  first  function
src/app.ts:3:ghi789  second  function
```

```
mode: coverage                                      ← runtime-backed
src/app.test.ts:1:abc  alphaTest  test
src/app.ts:1:def  prod  function
src/app.ts:2:ghi  helper  function
```

```
mode: coverage [stale]                              ← coverage but trace outdated
src/app.test.ts:1:abc  prodTest  test [stale]
...
```

---

## Testing

- `test/tool-trace-static-mode-header.test.ts` — exact `.toBe()` on header string + `toHaveLength(4)` ensuring no extra prose lines injected (enforces AC2, AC3, AC8)
- `test/extension-trace-description.test.ts` — exact `.toBe()` on full tool description string (enforces AC5, AC6, AC7)
- Pre-existing: `tool-trace-coverage.test.ts`, `tool-trace-stale.test.ts`, `tool-trace-static-fallback.test.ts` — all passing, covering AC1 and AC4

200 tests, 200 pass (excluding pre-existing flaky timing test in `tsserver-client.test.ts`).
