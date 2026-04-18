# Spec — #067 Align tool schemas, docs, and validators for closed-value parameters

## Goal
Align every currently-registered `pi-codegraph` tool parameter that represents a closed set — `impact.changeType`, `resolve_edge.kind`, `delete_edge.kind`, and `dead_code.kind` — so that TypeBox schema, parameter description, README coverage, and runtime validator all publish the same set of allowed values, and lock that alignment with regression tests so drift like #066 cannot silently return.

## Acceptance Criteria
1. `ImpactParams.changeType` schema continues to be a `Type.Union` over exactly the literals `"signature_change"`, `"removal"`, `"behavior_change"`, `"addition"` (no additions or removals) and its TypeBox `description` explicitly enumerates those four values.
2. `ResolveEdgeParams.kind` schema is a `Type.Union` over the 8 literals `"calls"`, `"imports"`, `"implements"`, `"extends"`, `"tested_by"`, `"co_changes_with"`, `"renders"`, `"routes_to"` — the exact set exported as `VALID_EDGE_KINDS` in `src/tools/resolve-edge.ts`.
3. `ResolveEdgeParams.kind` TypeBox `description` explicitly enumerates the 8 allowed edge-kind values and contains no open-set suffix such as `"..."` or `"etc."`.
4. `DeleteEdgeParams.kind` schema is a `Type.Union` over the same 8 edge-kind literals, matching `VALID_EDGE_KINDS` in `src/tools/delete-edge.ts`.
5. `DeleteEdgeParams.kind` TypeBox `description` explicitly enumerates the 8 allowed edge-kind values and contains no `"..."` or `"etc."` suffix.
6. `DeadCodeParams.kind` TypeBox `description` explicitly enumerates the 6 `NodeKind` values `"function"`, `"class"`, `"interface"`, `"module"`, `"endpoint"`, `"test"` and contains no `"..."` or `"etc."` suffix; the schema shape itself remains `Type.Optional(Type.String)`.
7. The runtime validators `isValidEdgeKind` in `src/tools/resolve-edge.ts` and `src/tools/delete-edge.ts` remain in place and continue to produce the existing `Invalid edge kind "<kind>". Valid kinds: ...` error message for inputs outside the 8-kind set.
8. `README.md`'s `impact` section mentions every `changeType` value (`signature_change`, `removal`, `behavior_change`, `addition`) at least once.
9. `README.md`'s `resolve_edge` section lists all 8 valid edge-kind values; no example in that section uses a kind outside the 8.
10. `README.md`'s `delete_edge` section lists all 8 valid edge-kind values; no example in that section uses a kind outside the 8.
11. `README.md`'s `dead_code` section references the 6 `NodeKind` filter values; no example uses a kind outside the 6.
12. A regression test (extension-level) asserts AC 1 — that `impact.changeType`'s schema literals are the expected 4 and the parameter description is the exact expected string.
13. A regression test (extension-level) asserts AC 2 + AC 3 — that `resolve_edge.kind` is a union of the 8 literals matching `VALID_EDGE_KINDS` and the parameter description is the exact expected string.
14. A regression test (extension-level) asserts AC 4 + AC 5 — that `delete_edge.kind` is a union of the 8 literals matching `VALID_EDGE_KINDS` and the parameter description is the exact expected string.
15. A regression test (extension-level) asserts AC 6 — that `dead_code.kind`'s description is the exact expected enumerating string.
16. A README/docs-drift regression test asserts AC 8, AC 9, AC 10, and AC 11 by scanning `README.md` for presence of the enumerated values within each tool's section and absence of any example using a value outside the closed sets.
17. A negative-wording regression test asserts AC 3, AC 5, and AC 6 — that none of the audited parameter descriptions in `src/index.ts` contain the substrings `"..."` or `"etc."`.
18. The wording and schema set for `symbol_graph.include` by issue #066 is unchanged: its TypeBox description is still `Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.` and its union literals are still `"neighborhood" | "contract" | "source"`.
19. The 5-default-public-tools registration surface is unchanged: with `CODEGRAPH_DEVMODE` unset, registered tools are exactly `symbol_graph`, `resolve_edge`, `delete_edge`, `impact`, `trace`.
20. Dev-mode-only tool registration stays gated on `CODEGRAPH_DEVMODE=1`: `graph_query`, `graph_overview`, and `dead_code` continue to be registered only when the env var is set.
21. Top-level tool descriptions (for all audited tools) remain compliant with `docs/tool-descriptions.md`: no inline examples and no enumerations inside the top-level description (enumerations live only in parameter descriptions and README).
22. Tool execution behavior, tool output format, graph/indexing behavior, and the full existing test suite continue to pass unchanged.

## Out of Scope
- Expanding, shrinking, or otherwise changing the runtime-valid set of edge kinds, change types, or node kinds (brainstorm **D1**).
- Any upstream prompt-assembly fix for loss of enum literals in the model-facing tool surface — that is a pi-coding-agent concern (brainstorm **D2**).
- Broader M10 tool-surface consolidation (unifying the symbol-lookup family, demoting/removing dev-mode tools, telemetry-driven cuts) — brainstorm **D3**.
- Output-ceremony cleanup or description normalization beyond the enum-alignment scope (M10 Phase 1/#059 and Phase 2/#060) — brainstorm **D4**.
- Extracting shared constants/helpers for closed sets across schema + description + validator (brainstorm **O1**) — may be done opportunistically during implementation only if it stays within existing files and changes no runtime behavior, but is not a success condition.
- Cross-linking `docs/tool-descriptions.md` with closed-value parameter guidance (brainstorm **O2**) — not required for this issue.
- Tightening `dead_code.kind`'s schema from `Type.Optional(Type.String)` to a literal union (brainstorm **C4**).

## Open Questions
None.

## Requirement Traceability
- `R1` -> AC 1, AC 12
- `R2` -> AC 2, AC 13
- `R3` -> AC 3, AC 13, AC 17
- `R4` -> AC 4, AC 14
- `R5` -> AC 5, AC 14, AC 17
- `R6` -> AC 6, AC 15, AC 17
- `R7` -> AC 8, AC 16
- `R8` -> AC 9, AC 10, AC 16
- `R9` -> AC 9, AC 10, AC 11, AC 16
- `R10` -> AC 12
- `R11` -> AC 13
- `R12` -> AC 14
- `R13` -> AC 15
- `R14` -> AC 16
- `R15` -> AC 17
- `O1` -> Out of Scope (opportunistic only)
- `O2` -> Out of Scope
- `D1` -> Out of Scope
- `D2` -> Out of Scope
- `D3` -> Out of Scope
- `D4` -> Out of Scope
- `C1` -> AC 22
- `C2` -> AC 7
- `C3` -> AC 18
- `C4` -> Out of Scope (schema-tightening for `dead_code.kind` explicitly excluded)
- `C5` -> AC 21
- `C6` -> AC 19, AC 22
- `C7` -> AC 20
