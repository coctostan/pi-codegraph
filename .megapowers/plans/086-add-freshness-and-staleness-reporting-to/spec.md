## Goal
Add result-scoped freshness and staleness reporting to `symbol_graph`, `impact`, and `trace` so agents can quickly tell whether graph-backed output reflects the current working tree, which returned files/symbols/edges are stale, and whether the result is safe to rely on before editing.

## Acceptance Criteria
1. A shared freshness evaluator returns a typed report with status `fresh`, `partial`, `stale`, or `unknown`, and the status is computed from the requested target and returned result items rather than only from global project stale-file counts.

2. When a result-scoped report is fresh and `suppressTrustHeader` is not enabled, each public tool output begins with exactly one compact freshness line: `Trust: fresh`.

3. When a result-scoped report is `partial`, `stale`, or `unknown`, the freshness header includes a status line plus actionable detail lines for relevant changed files, deleted files, affected symbols when derivable, stale edge count when nonzero, and a short recommendation.

4. The evaluator marks a returned node stale when the node’s indexed `content_hash` differs from the current hash of its source file.

5. The evaluator marks a returned node or indexed file deleted when its indexed source file no longer exists in the working tree.

6. When indexed timestamp data is available for a stale or deleted file, degraded freshness detail includes that indexed timestamp in deterministic form; when unavailable, reporting remains deterministic and does not invent wall-clock wording.

7. The evaluator marks a returned edge stale when the edge provenance `content_hash` no longer matches the current hash of the edge evidence file, using the source node’s file as the evidence file when no more specific evidence file exists.

8. `symbol_graph` output distinguishes stale target-symbol state from stale neighborhood-edge state, including a `stale` status when the target is stale and a `partial` status when the target is fresh but returned neighborhood evidence is stale.

9. `impact` output includes an explicit degraded-result warning when stale returned dependencies or stale dependency edges may make blast-radius analysis incomplete.

10. `trace` output includes an explicit degraded-result warning when stale call edges, stale trace steps, deleted files, or unresolved stored steps may make the execution path unreliable.

11. Freshness reporting is integrated into the existing public implementations `symbolGraph(params: SymbolGraphParams) => string`, `impact(params) => string`, and `trace(params: TraceParams) => string` without adding or removing public tools.

12. `suppressTrustHeader: true` removes the freshness/trust header consistently for `symbol_graph`, `impact`, and `trace`, while preserving the rest of the tool output, existing anchors, provenance labels, signal badges, row-level stale markers, indexing-failed notes, and dev metadata behavior.

13. Existing row-level `[stale]` markers remain present for stale returned rows or trace steps even when the new freshness header is added.

14. Automated tests cover fresh output, stale target files, stale neighbor/dependency edges, deleted files, degraded `impact` warnings, degraded `trace` warnings, and `suppressTrustHeader: true` behavior.

15. The full verification suite for this issue includes `bun test` and `bun run check`.

## Out of Scope
- Building a full automatic reindex daemon.
- Adding broad token or cost analytics.
- Adding natural-language graph explanations beyond compact actionable freshness details.
- Changing the public tool set except for internal implementation needs.
- Expanding this work into a general graph report or path traversal feature.
- Adding optional affected-symbol inference where symbols cannot be cheaply derived from existing graph data.

## Open Questions
None.

## Requirement Traceability
- R1 -> AC 2
- R2 -> AC 3
- R3 -> AC 8
- R4 -> AC 9
- R5 -> AC 10
- R6 -> AC 4
- R7 -> AC 5
- R8 -> AC 6
- R9 -> AC 7
- R10 -> AC 1
- R11 -> AC 3
- R12 -> AC 3
- R13 -> AC 9
- R14 -> AC 10
- R15 -> AC 8
- R16 -> AC 1
- R17 -> AC 12
- R18 -> AC 14
- R19 -> AC 14
- R20 -> AC 14
- R21 -> AC 14
- R22 -> AC 14
- R23 -> AC 2
- R24 -> AC 3
- O1 -> AC 1
- O2 -> AC 3, Out of Scope
- O3 -> AC 13
- D1 -> Out of Scope
- D2 -> Out of Scope
- D3 -> Out of Scope
- D4 -> Out of Scope
- D5 -> Out of Scope
- C1 -> AC 11
- C2 -> AC 12
- C3 -> AC 1
- C4 -> AC 4, AC 6, AC 7
- C5 -> AC 3, AC 9, AC 10
- C6 -> AC 2, AC 3
- C7 -> AC 12, AC 13
- C8 -> AC 6, AC 14
