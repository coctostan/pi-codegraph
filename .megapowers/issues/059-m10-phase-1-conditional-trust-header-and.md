---
id: 59
type: feature
status: done
created: 2026-04-16T15:01:36.274Z
milestone: M10
---
# M10 Phase 1: Conditional Trust header and dev-gated token meta
## Goal

Reduce per-call tool output token cost with **no API or surface change**. This is the lowest-risk, reversible first step of the refocus and can ship before any surface decisions are made.

## Context

Every read-only tool currently prepends a Trust header and appends a `_meta: tokens_saved: ...` footer on **every** call. On the ~95% of calls where the graph is fresh, this is unconditional noise — the model doesn't consume `tokens_saved` (it's developer telemetry), and the Trust header carries no new information when status is `fresh`.

See `~/pi/workspace/thinkingspace/plans/codegraph-refocus-plan.md` — Phase 1.

## Changes

- **Trust header becomes conditional.** Render only when `status !== "fresh"` (i.e., `stale`, `mixed`, `heuristic`, `runtime-backed`). On fresh calls, omit the header entirely.
- **`_meta: tokens_saved` moves behind a dev flag** (env var, e.g. `CODEGRAPH_DEVMETA=1`, or pi config). Default: off.
- **Keep provenance labels** on edges (`[source: lsp]`, etc.) — load-bearing for trust assessment.
- **Keep signal badges** (`[hub]`, `[tested]`, `[bottleneck]`) — useful at a glance.

## Exit criteria

- Fresh-call output loses the Trust header and the `_meta` line.
- `stale`/`mixed`/`heuristic`/`runtime-backed` calls still render the full Trust header.
- `CODEGRAPH_DEVMETA=1` re-enables the `_meta: tokens_saved` footer.
- Average tool-output token count drops measurably on fresh calls.
- All existing tests pass; output snapshots updated where applicable.

## Why first

Reversible, no API shape change, cuts noise immediately. Independent of any surface decisions — can ship without waiting on Phases 2–5.
