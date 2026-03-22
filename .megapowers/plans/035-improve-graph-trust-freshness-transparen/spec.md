## Goal
Add a shared, compact trust/freshness header to the read-oriented graph tools so an agent can quickly determine whether output is fresh, stale, heuristic, runtime-backed, or mixed, without losing existing row-level exception markers or expanding scope into new indexing behavior.

## Acceptance Criteria
1. **AC1** `symbol_graph`, `trace`, `impact`, and `graph_query` each prepend a trust/freshness header before any existing result body content.
2. **AC2** The trust/freshness header uses the same field order, labels, and status vocabulary across `symbol_graph`, `trace`, `impact`, and `graph_query`.
3. **AC3** The header includes a top-level trust status that is sufficient for an agent to distinguish at least these cases when applicable: `fresh`, `stale`, `heuristic`, `runtime-backed`, and `mixed`.
4. **AC4** The header is compact and bounded to a small fixed number of lines rather than repeating trust state on every result row.
5. **AC5** Existing row-level/local markers remain in place for row-specific exceptions, including stale or unresolved rows, instead of being removed or replaced by the header.
6. **AC6** `trace` continues to distinguish coverage-backed output from static heuristic output in its mode semantics after the trust-header change.
7. **AC7** In a fully fresh scenario, each read-oriented tool emits a header indicating fresh/current output without adding stale markers to otherwise fresh result rows.
8. **AC8** In a stale or mixed scenario, each read-oriented tool emits a header indicating non-fully-fresh trust state, while row-level markers continue to identify locally stale exceptions where applicable.
9. **AC9** The implementation reuses existing freshness/provenance/trace-mode signals where available and does not require a new indexing stage, file-watching mode, or refresh workflow.
10. **AC10** `resolve_edge` does not receive the generic trust/freshness header added to the read-oriented tools in this issue.
11. **AC11** The default always-on header does not include indexed-at / recency timestamps.
12. **AC12** The default always-on header may include compact summary metadata derived from existing state, but only if it fits the shared header contract and remains concise.

## Out of Scope
- Applying the same generic trust/freshness header to `resolve_edge`.
- New indexing stages, trust-computation subsystems, or graph-refresh mechanisms beyond existing behavior.
- File watching, live mode, or new refresh workflows.
- A lifecycle/review/approval system for agent-authored edges.
- Always-on indexed-at / recency timestamp output.
- Human-oriented explanatory prose in tool results.

## Open Questions
None.

## Requirement Traceability
- `R1 -> AC1`
- `R2 -> AC2`
- `R3 -> AC3`
- `R4 -> AC4, AC5`
- `R5 -> AC6`
- `R6 -> AC9`
- `R7 -> AC1, AC2, AC3, AC8`
- `R8 -> AC4, AC12`
- `O1 -> AC12`
- `O2 -> Out of Scope`
- `O3 -> Out of Scope`
- `D1 -> Out of Scope`
- `D2 -> Out of Scope`
- `D3 -> Out of Scope`
- `D4 -> Out of Scope`
- `C1 -> AC9`
- `C2 -> AC9`
- `C3 -> AC1, AC4, AC5`
- `C4 -> AC4, AC12`
- `C5 -> AC2`
- `C6 -> Out of Scope`
