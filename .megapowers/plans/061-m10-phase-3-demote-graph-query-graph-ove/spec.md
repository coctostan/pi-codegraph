## Goal
Reduce the default model-facing codegraph tool surface by gating `graph_query`, `graph_overview`, and `dead_code` behind a single `CODEGRAPH_DEVMODE` flag, remove `symbol_search` from tool registration while preserving its internal API, and add `symbol_graph.include: ["contract"]` plumbing that reuses the existing `symbol_contract` extraction/rendering path without changing default output behavior.

## Acceptance Criteria
1. During `piCodegraph(pi)` initialization, the extension reads `process.env.CODEGRAPH_DEVMODE` exactly once and treats `1`, `true`, `yes`, and `on` as enabled case-insensitively; unset, empty, `0`, and `false` leave dev mode disabled, and tool registration does not change mid-session after load.

2. When dev mode is disabled, the extension does not register `graph_query`, `graph_overview`, or `dead_code` with pi.

3. When dev mode is enabled, the extension registers `graph_query`, `graph_overview`, and `dead_code` with the same tool names, descriptions, parameter schemas, and runtime behavior they had before this issue.

4. The extension never registers `symbol_search` as a model-facing tool, regardless of whether `CODEGRAPH_DEVMODE` is enabled.

5. `src/tools/symbol-search.ts` continues to export `symbolSearch` and existing internal/testing helpers needed by current internal consumers, with unchanged signatures and behavior.

6. Existing internal call sites that use `symbolSearch` continue to work without call-site changes.

7. The `symbol_graph` tool schema accepts an optional `include` parameter whose element type is limited to the literal value `"contract"`; unsupported values are rejected by schema validation.

8. Calling `symbol_graph` with `include` omitted, or with `include: []`, returns output that is byte-identical to the pre-change `symbol_graph` output for the same input.

9. Calling `symbol_graph` with `include: ["contract"]` appends a clearly delimited contract section after the existing neighborhood output, without inlining contract content into the neighborhood section.

10. The appended contract section is generated through the same extraction/rendering path used by the standalone `symbol_contract` tool, so contract rendering has a single source of truth.

11. If `symbol_graph` is called with `include: ["contract"]` and the symbol is missing or no contract data is available, the main neighborhood output still renders and the contract portion follows the existing `symbol_contract` empty-state behavior.

12. The standalone `symbol_contract` tool remains registered in this phase with its current name, parameters, and output behavior.

13. `README.md` documents the default public tool surface when `CODEGRAPH_DEVMODE` is unset, documents `CODEGRAPH_DEVMODE=1` as the way to expose `graph_query`, `graph_overview`, and `dead_code`, and removes `symbol_search` from the public tool list while noting it is internal-only.

14. `ARCHITECTURE.md` reflects the default registered tool set, documents the `CODEGRAPH_DEVMODE` gating rule, and identifies `symbol_search` as internal-only.

15. `docs/tool-descriptions.md` is updated only where needed to keep descriptions accurate for this issue, including any necessary mention of `symbol_graph.include`.

16. Automated registration tests verify that, by default, `graph_query`, `graph_overview`, `dead_code`, and `symbol_search` are not registered.

17. Automated registration tests verify that with `CODEGRAPH_DEVMODE=1`, `graph_query`, `graph_overview`, and `dead_code` are registered, while `symbol_search` is still not registered.

18. Automated tests verify that `CODEGRAPH_DEVMODE` accepts `1`, `true`, `yes`, and `on` case-insensitively, and does not enable dev mode for unset, empty, `0`, or `false`.

19. Automated `symbol_graph` tests verify that default output is unchanged, `include: ["contract"]` appends a contract section, unsupported `include` values are rejected, and the appended contract content matches the output produced by the shared `symbol_contract` extraction/rendering path for the same symbol.

20. After updating or removing any tests that previously treated `symbol_search` as a registered tool, the full existing test suite passes.

## Out of Scope
- Removing standalone `symbol_card` or `symbol_contract` from the registered tool surface.
- Expanding `symbol_graph.include` beyond `"contract"`.
- Deleting `resolve_edge` or `delete_edge` based on telemetry or CODI findings.
- Adding per-project, per-user, or per-tool configuration for dev-mode tools.
- Adding separate environment flags for individual dev-mode tools.
- Emitting deprecation warnings from removed or demoted tool outputs.
- Any change to the indexer, graph store, SQLite schema, or `.codegraph/` layout.
- Any change to output ceremony, including Trust headers or `_meta`.
- Optional niceties only: a load-time dev-mode log line, inline refocus-plan comments in `src/index.ts`, and benchmark/PR-note reporting of before/after tool counts.

## Open Questions
None.

## Requirement Traceability
- R1 -> AC 1
- R2 -> AC 2
- R3 -> AC 2
- R4 -> AC 2
- R5 -> AC 3
- R6 -> AC 1
- R7 -> AC 4
- R8 -> AC 5
- R9 -> AC 6
- R10 -> AC 7
- R11 -> AC 8
- R12 -> AC 9
- R13 -> AC 10
- R14 -> AC 11
- R15 -> AC 12
- R16 -> AC 13
- R17 -> AC 14
- R18 -> AC 15
- R19 -> AC 16
- R20 -> AC 17, AC 18
- R21 -> AC 19
- R22 -> AC 20

- O1 -> Out of Scope
- O2 -> Out of Scope
- O3 -> Out of Scope

- D1 -> Out of Scope
- D2 -> Out of Scope
- D3 -> Out of Scope
- D4 -> Out of Scope
- D5 -> Out of Scope
- D6 -> Out of Scope
- D7 -> Out of Scope
- D8 -> Out of Scope

- C1 -> AC 3, AC 7, AC 12, AC 15
- C2 -> AC 5
- C3 -> AC 1, AC 2, AC 3, AC 4
- C4 -> AC 8, AC 19
- C5 -> AC 10, AC 19
- C6 -> AC 13, AC 14
- C7 -> AC 2, AC 3, AC 4, AC 7, AC 8, AC 9, AC 12
