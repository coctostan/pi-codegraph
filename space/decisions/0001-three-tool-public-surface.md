---
recovered: ROADMAP.md:178-182; commit 9eca8f21 (#063); test/phase5-decision-matrix.ts:15-21
---
# The public surface is three read-only tools

Agents skipped codegraph for grep/read when it offered 11 overlapping tools, so M10 cut the surface to `symbol_graph`, `impact` and `trace`, folding card, contract and source into `symbol_graph`'s `include`, and deleted `resolve_edge`, `delete_edge`, `graph_query`, `graph_overview` and `dead_code` after zero calls in the 2026-04-17–19 window, with no deprecation shim. A new capability extends one of the three before it earns a new tool.
