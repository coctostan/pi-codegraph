## Goal

Add a shared signal layer that computes structural role and risk signals from the indexed graph, then surfaces those signals as compact always-on inline annotations in `impact`, `symbol_graph`, and `trace` so agents can prioritize what to inspect without extra tool calls.

## Acceptance Criteria

1. A single shared node-signal layer is the only implementation that computes the role and ranking signals used by `impact`, `symbol_graph`, and `trace`.
2. Signal computation at tool-render time uses only already-indexed graph data and current graph metadata; it does not invoke tsserver, tree-sitter, ast-grep, git, network calls, or add new dependencies.
3. The shared signal layer computes `fanIn` and `fanOut` as counts of distinct inbound and outbound `calls` neighbors for a node, so duplicate provenance rows for the same caller/callee pair do not increase the counts.
4. The shared signal layer assigns role tags as follows: `entry-point` for exported non-module symbols with `fanIn = 0`; `hub` for nodes with `fanIn >= 3` and `fanOut >= 3`; `leaf` for nodes with `fanOut = 0`.
5. The shared signal layer assigns `tested` when a node has at least one `tested_by` edge, `untested` when it has none, and `framework-mediated` when it has at least one incident edge whose provenance source is `ast-grep`.
6. The shared signal layer computes a co-change score from git `co_changes_with` data; for non-module symbols it uses the module node for the same file, and for `impact` ranking against changed symbols it uses the highest `co_changes` value connecting the candidate file/module to any changed symbol file/module. Missing co-change data yields `0`.
7. `impact` computes edge-chain confidence for every returned dependent as the minimum hop confidence along the selected impact path, where each hop uses the highest-confidence `calls` edge available between the two nodes.
8. `impact` remains hashline-anchored and retains `classification` and `depth`, but returned dependents are ordered by deterministic priority: `breaking` before `behavioral`, higher `fanIn`, `untested` before `tested`, higher co-change score, higher chain confidence, shallower depth, then file/name.
9. Each `impact` result line ends with one compact bracketed annotation explaining the ranking basis and including: applicable role tags, `fan-in:<n>`, coverage tag (`tested` or `untested`), `co-change:<n>`, and `chain-confidence:<value>`.
10. `symbol_graph` preserves the current symbol header and section layout, and appends one compact bracketed role-tag list to the resolved symbol header anchor line and to each resolved neighbor line. Unresolved rows remain otherwise unchanged.
11. `trace` preserves the current `mode:` header and step ordering, and appends one compact bracketed role-tag list to each rendered step line.
12. Signal annotations in `impact`, `symbol_graph`, and `trace` are always on, require no new parameter, and are added as inline suffixes rather than separate sections or prose blocks.
13. Regression tests cover: exported-vs-non-exported entry-point detection, hub/leaf/tested/untested/framework-mediated classification, fan-in/fan-out counting without provenance double counting, co-change score derivation from module-level git edges, edge-chain confidence calculation, `impact` ranking order, `impact` annotations, `symbol_graph` tags, `trace` tags, and additive preservation of existing anchors, headers, stale markers, `classification`, and `depth`.
14. A performance regression test using an in-memory store with at least 100 impacted symbols verifies that `impact` with always-on signal annotations completes within 1 second.

## Out of Scope

- Adding signal annotations to `graph_query`.
- New standalone tools such as `symbol_profile`.
- A merged multi-tool view that combines `impact`, `symbol_graph`, and `trace` into one response.
- Grouping `impact` results into semantic clusters or module/co-change buckets.
- LLM-generated summaries, embeddings, or semantic similarity features.
- Pattern classification such as singleton, factory, or dependency-injection heuristics.
- User-configurable hub thresholds or user-configurable ranking formulas in this issue.

## Open Questions

None.

## Requirement Traceability

- `R1 -> AC 1, AC 2`
- `R2 -> AC 4, AC 5`
- `R3 -> AC 3, AC 6`
- `R4 -> AC 8`
- `R5 -> AC 9`
- `R6 -> AC 10`
- `R7 -> AC 11`
- `R8 -> AC 10, AC 11, AC 12`
- `R9 -> AC 7, AC 8, AC 9`
- `O1 -> Out of Scope`
- `O2 -> Out of Scope`
- `D1 -> Out of Scope`
- `D2 -> Out of Scope`
- `D3 -> Out of Scope`
- `D4 -> Out of Scope`
- `C1 -> AC 2, AC 6, AC 7`
- `C2 -> AC 2`
- `C3 -> AC 14`
- `C4 -> AC 8, AC 10, AC 11, AC 12, AC 13`
- `C5 -> AC 1`
