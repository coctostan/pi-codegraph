---
id: 63
type: feature
status: open
created: 2026-04-16T15:01:36.275Z
milestone: M10
---
# M10 Phase 5: Dead-code cut — remove zero-usage tools based on telemetry
## Goal

Remove what nobody uses — based on **evidence, not aesthetics**. This phase is gated on telemetry collected after Phases 1–4 have been in production for a meaningful sample of real sessions.

## Context

The refocus plan reduces public surface from 11 → 3, but the final cuts shouldn't happen until real usage data says so. `resolve_edge` and `delete_edge` (agent-teachable edges) are the highest-profile deletion candidates — theoretically valuable, empirically rare. Other dev-mode tools may also show zero usage even among developers.

See `~/pi/workspace/thinkingspace/plans/codegraph-refocus-plan.md` — Phase 5.

## Pre-work (required before scoping this issue's plan)

- Collect usage telemetry across a meaningful sample of real sessions after Phases 1–4 land. Document the observation window (N sessions / M days) and the per-tool call counts.
- Re-check the success criterion from Phase 3: **did tool-pick-rate on structural questions rise after demotion?** If not, the "surface size suppresses pick-rate" thesis was wrong — stop and re-diagnose before any further cuts.

## Candidates for deletion (subject to telemetry)

- **`resolve_edge` / `delete_edge`** — if zero agent usage in the observation window, delete both. If nonzero, keep as dev-mode.
- **Anything in dev-mode** (`graph_query`, `graph_overview`, `dead_code`) that is also zero-usage even among developers.

## Rules

- Keep everything that shows real usage. Don't cut for aesthetic reasons — cut based on evidence.
- No deprecation warnings in tool output. If a tool is cut, it's cut. Deprecation periods add noise to the exact ceremony the refocus is trying to reduce.
- Each deletion decision must land with per-tool evidence in the issue's plan / summary.

## Exit criteria

- Telemetry window + per-tool call counts documented in the PLAN phase.
- Pre-cut gate (Phase 3 pick-rate check) explicitly passed.
- Deletion decisions have per-tool evidence.
- Kept tools remain functional; deleted tools are fully removed (code, tests, docs, schemas). No deprecation shims.
- README + `ARCHITECTURE.md` reflect the final public surface.
- Success criteria from the refocus plan verified:
  - Public tool count dropped from 11 to ~3 (plus dev-mode overflow).
  - Per-call output tokens dropped measurably on fresh-graph calls.
  - Tool-picking rate on structural questions rose.
  - Zero regression on power-user capability (anything done via `graph_query` still works behind the flag).
  - README and code agree on what tools exist.
