---
id: 37
type: bugfix
status: done
created: 2026-03-22T21:43:04.548Z
priority: 3
---
# Tool input validation gaps: negative limit, self-referential edges, empty evidence
Stress testing surfaced three input validation gaps in tool functions that accept but shouldn't:

1. **`symbol_graph` negative `limit`** — `limit=-1` bypasses neighbor truncation and returns all items, while `limit=0` correctly returns none. `rankNeighbors` in `src/output/anchoring.ts` doesn't guard against negative values. Fix: treat `limit < 1` as the default (10).

2. **`resolve_edge` self-referential edges** — `source === target` (same symbol) creates an `A → calls → A` loop that appears in `symbol_graph` output as both caller AND callee. This pollutes the graph and confuses agents. Fix: reject edges where source and target resolve to the same node ID.

3. **`resolve_edge` empty evidence** — Evidence is the primary justification for agent-written edges, but an empty string `""` is accepted. This reduces auditability of agent edges. Fix: require evidence to be non-empty (minimum 1 character after trim).

All three are in the tool layer (`src/tools/` and `src/output/`), low severity individually, but worth hardening together.
