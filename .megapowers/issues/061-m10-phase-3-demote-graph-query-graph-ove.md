---
id: 61
type: feature
status: open
created: 2026-04-16T15:01:36.274Z
milestone: M10
---
# M10 Phase 3: Demote graph_query / graph_overview / dead_code behind CODEGRAPH_DEVMODE; make symbol_search internal
## Goal

Shrink the model-facing surface by moving power-user / niche tools behind a dev flag, and demoting `symbol_search` to internal-use-only.

## Context

Of the 11 currently registered tools, several are rarely used by agents in normal tasks:
- `graph_query` — power-user Cypher. Humans use it occasionally; agents almost never during normal tasks.
- `graph_overview` — codebase-level summary. Human-oriented, rarely fires for agents.
- `dead_code` — niche. Cleanup phases only.
- `symbol_search` — useful internally for disambiguation, but overlapping with `symbol_graph` / `impact` / `trace` when exposed directly.
- `symbol_contract` — its extraction logic wants to be a view on `symbol_graph`, not a standalone tool.

See `~/pi/workspace/thinkingspace/plans/codegraph-refocus-plan.md` — Phase 3.

## Changes

- **Introduce dev-mode flag** (default off): `CODEGRAPH_DEVMODE=1` env var. A single flag is sufficient for v1 (per-user config is overengineered).
- When the flag is unset, **do not register** as model-facing tools:
  - `graph_query`
  - `graph_overview`
  - `dead_code`
- **`symbol_search` becomes internal.** Remove its tool registration entirely. Keep the exported function for internal use (`symbol_graph` / `impact` / `trace` disambiguation; future CODI consumption).
- **Begin absorbing `symbol_contract`.** Expose its extraction logic as an optional section in `symbol_graph`'s response (e.g. `include: ["contract"]`). `symbol_contract` may remain registered in this phase — full removal lands in Phase 4.

## Sequencing note

The refocus plan puts Phase 3 **after** CODI v0.1 has produced usage data. If CODI v0.1 usage data is not yet available when this issue is picked up, land the flag plumbing + `symbol_search` demotion first, and hold the `symbol_contract` absorption until Phase 4 or until CODI data arrives. Make the decision explicit in the PLAN phase of this issue.

## Exit criteria

- `CODEGRAPH_DEVMODE` unset → `graph_query`, `graph_overview`, `dead_code` are not registered with pi.
- `CODEGRAPH_DEVMODE=1` → all currently registered tools appear.
- `symbol_search` is no longer a registered model-facing tool; its internal function remains exported.
- `symbol_graph` response can optionally include contract info (initial plumbing for Phase 4).
- Tests that assert tool registration reflect the new default.
- README + `ARCHITECTURE.md` updated to describe the public vs. dev-mode split.
