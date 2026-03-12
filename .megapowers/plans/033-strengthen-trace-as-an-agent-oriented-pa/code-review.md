# Code Review — issue 033-strengthen-trace-as-an-agent-oriented-pa

## Files Reviewed

| File | Change |
|------|--------|
| `src/tools/trace.ts` | Added `formatModeHeader()` helper; updated static and coverage return sites to use it |
| `src/index.ts` | Updated `trace` tool description to agent-oriented wording |
| `test/tool-trace-static-mode-header.test.ts` | New test: static mode header exact content + step backward compatibility |
| `test/extension-trace-description.test.ts` | New test: trace tool description exact string match |

---

## Strengths

**`formatModeHeader` abstraction (`src/tools/trace.ts:73-78`)** — Correctly eliminates the inline string duplication that existed between the coverage and static return sites. The coverage path previously had `\`mode: coverage${traceStale ? " [stale]" : ""}\`` inlined; the static path had `"mode: static"` inlined; now both are produced by the same function with a typed union parameter. Single point of change if the format ever evolves.

**Minimal diff footprint** — 9 lines added to `trace.ts`, 1 line changed in `src/index.ts`. The change does exactly what the spec requires and nothing more. No gratuitous refactoring, no speculative abstractions.

**`toHaveLength(4)` assertion (`test/tool-trace-static-mode-header.test.ts:68`)** — Smart test design. By asserting the exact line count (1 header + 3 steps), it makes regression impossible without a test failure if anyone adds an extra prose line to the output. This directly enforces AC3 and AC8.

**`lines[1]` format checks (`test/tool-trace-static-mode-header.test.ts:66-67`)** — Two separate `toContain` assertions on `lines[1]` independently verify the anchor format (`src/app.ts:1:`) and the name+kind format (`entry  function`). These are the exact two parts an agent consumes from a step line — precise and meaningful.

**Exact `.toBe()` for description (`test/extension-trace-description.test.ts:28-30`)** — Using `.toBe()` rather than `.toContain()` for the description test means the test locks down the full string, preventing partial drift while still being readable. Good choice given all three spec requirements (AC5, AC6, AC7) are baked into one string.

---

## Findings

### Critical
None.

### Important
None.

### Minor

**1. AGENTS.md trace table entry not updated (`AGENTS.md`, trace row)**
The developer-facing table in `AGENTS.md` still reads: `"Given an entry point (function, endpoint, test), return ordered execution path"`. The tool description in `src/index.ts` was updated but this doc wasn't. Not agent-facing, so no correctness impact; low-priority doc hygiene.

**2. Asymmetry: static traces don't propagate step-level staleness to the header**
`formatLiveTraceLine` returns a plain `string`, while `formatStoredTraceLine` returns `{line, stale}`. This means the static return site (`trace.ts:102`) can't aggregate step staleness into the header — individual static steps show `[stale]` per-step, but the header is always `"mode: static (heuristic, no runtime evidence)"` with no `[stale]` suffix. The coverage path does aggregate staleness into the header.
This asymmetry pre-dates this PR and is not a regression. The spec's AC4 is confirmed by the coverage-stale test only. Noted here for visibility if a future issue addresses it — fixing it would require either changing `formatLiveTraceLine` to return a struct, or a post-processing pass on the rendered strings.

**3. Pre-existing test uses loose `toContain("mode: static")` (`test/tool-trace-static-fallback.test.ts:29`)**
This pre-existing assertion passes with both the old `"mode: static"` and the new `"mode: static (heuristic, no runtime evidence)"`. The new dedicated test uses `.toBe()` for precision. No action needed — the pre-existing test's looseness is intentional (it was testing static fallback behavior, not the exact header wording), and the new test covers the stricter requirement.

---

## Recommendations

None beyond the minor doc nit (AGENTS.md). The implementation is clean, well-targeted, and adds no unnecessary complexity.

---

## Assessment

**ready**

The change is small, correct, and complete. `formatModeHeader` is a proper abstraction — it removes duplication, is correctly typed, and makes both the static heuristic wording and the staleness suffix impossible to drift between call sites. Tests are meaningful, use real data flows (not mocks of implementation details), and enforce all spec requirements with appropriate precision. No findings require pre-merge fixes.
