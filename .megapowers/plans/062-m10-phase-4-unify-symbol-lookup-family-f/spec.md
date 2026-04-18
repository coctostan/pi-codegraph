## Goal
Unify the symbol inspection surface so agents use `symbol_graph` as the single public symbol lookup tool. This phase changes the default response to a compact card, keeps the legacy neighborhood output behind `include: ["neighborhood"]`, removes public registration of `symbol_card` and `symbol_contract`, and preserves the existing card/contract/source rendering logic as reusable internal paths.

## Acceptance Criteria
1. The public tool registry exposes `symbol_graph` as the only registered symbol lookup/inspection tool, and neither `symbol_card` nor `symbol_contract` is registered.
2. The card, contract, and source section renderers remain available as shared internal module APIs callable by `symbol_graph` and existing internal consumers/tests, and `symbol_graph` uses those shared APIs instead of duplicating equivalent rendering logic.
3. Calling `symbol_graph` without an `include` argument returns a compact card-style base view.
4. Calling `symbol_graph` with `include: []` returns the same output as omitting `include`.
5. The default card-style base view includes symbol identity/definition, signature, inline signals, a top relationship summary, and covering tests.
6. The default card-style base view omits the legacy `Exported` section.
7. The default base view remains compact: contract and source sections are absent unless explicitly requested through `include`.
8. The `symbol_graph.include` schema accepts only `"neighborhood"`, `"contract"`, and `"source"` values; any other value fails schema validation.
9. `include: ["neighborhood"]` selects the legacy full-neighborhood `symbol_graph` view as the base output.
10. For the same input, `include: ["neighborhood"]` produces byte-identical output to the pre-change legacy `symbol_graph` output.
11. When `"neighborhood"` is combined with other includes, the neighborhood view remains the base output.
12. `include: ["contract"]` appends a contract section to the active base output and does not replace that base output.
13. The appended contract section is produced by the same extraction/rendering path that previously powered `symbol_contract`.
14. `include: ["source"]` appends a source section to the active base output and does not replace that base output.
15. The appended source section is produced by the same source-snippet rendering path previously used for card/source output.
16. When both `"contract"` and `"source"` are requested, each section appends after the active base output, whether the base is the default card or the neighborhood view.
17. A not-found lookup returns explicit not-found output, not an empty result or unhandled failure, for both the default card base and include-driven requests.
18. An ambiguous lookup returns explicit ambiguity output, not an empty result or unhandled failure, for both the default card base and include-driven requests.
19. Tool output contains no deprecation warnings or migration ceremony for the removed standalone tools.
20. `README.md`, `ARCHITECTURE.md`, and public tool-description sources are updated to describe `symbol_graph` as the single public lookup tool and to document the default, neighborhood, contract, and source usage patterns.
21. Known downstream references to `symbol_card` and `symbol_contract` as registered tools are audited before completion; each audited reference is either updated to equivalent `symbol_graph` usage or explicitly recorded as an accepted out-of-scope break.
22. Automated tests are updated to cover tool registration, include schema, default and empty-include card output, legacy neighborhood regression, append behavior, not-found handling, ambiguous handling, shared renderer reuse, documentation/tool-description drift, and snapshot updates where output changes.
23. The full existing test suite passes after the change.

## Out of Scope
- Adding `include: ["signals"]` or any additional `include` values beyond `"neighborhood"`, `"contract"`, and `"source"`.
- Adding a new public parameter or toggle whose only purpose is to expose information already present in the default card.
- Making contract data part of the default `symbol_graph` output.
- Changing the graph store, SQLite schema, indexing pipeline, coverage/co-change behavior, output ceremony beyond what is necessary for this issue, or `.codegraph/` layout.
- Removing or reshaping `resolve_edge` or `delete_edge` based on telemetry.
- Requiring a specific new shared helper extraction beyond the renderer reuse required by the acceptance criteria.
- Requiring dedicated README migration tables/examples for former `symbol_card(...)` / `symbol_contract(...)` calls.
- Requiring a formal before/after public-tool-count artifact for this phase.
- Adding extra scope beyond this contract to satisfy the CODI v0.2 gate.

## Open Questions
None.

## Requirement Traceability
- R1 -> AC 1
- R2 -> AC 1
- R3 -> AC 1
- R4 -> AC 2, AC 13, AC 15
- R5 -> AC 3
- R6 -> AC 5
- R7 -> AC 5
- R8 -> AC 5
- R9 -> AC 5
- R10 -> AC 5
- R11 -> AC 6
- R12 -> AC 3
- R13 -> AC 4
- R14 -> AC 8
- R15 -> AC 8
- R16 -> AC 9
- R17 -> AC 10
- R18 -> AC 11
- R19 -> AC 12
- R20 -> AC 13
- R21 -> AC 14
- R22 -> AC 15
- R23 -> AC 16
- R24 -> AC 17
- R25 -> AC 18
- R26 -> AC 19
- R27 -> AC 20
- R28 -> AC 21
- R29 -> AC 21
- R30 -> AC 22
- R31 -> AC 22
- R32 -> AC 23
- O1 -> Out of Scope
- O2 -> Out of Scope
- O3 -> Out of Scope
- D1 -> Out of Scope
- D2 -> Out of Scope
- D3 -> Out of Scope
- D4 -> Out of Scope
- D5 -> Out of Scope
- D6 -> Out of Scope
- C1 -> AC 2, AC 13, AC 15
- C2 -> AC 10
- C3 -> AC 7, AC 12, AC 14, AC 16
- C4 -> Out of Scope
- C5 -> AC 1, AC 20
- C6 -> AC 2
- C7 -> AC 5, AC 6
- C8 -> Out of Scope
- C9 -> Out of Scope
