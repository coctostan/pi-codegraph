# Spec: symbol_graph — render all edge kinds

## Goal
`symbol_graph` only renders `calls` and `imports` edges, silently dropping 6 other edge kinds. This issue generalizes the neighbor loop and output formatting so all 8 `EdgeKind` values render as labeled, direction-aware sections, and removes the `renderImplementationsSuffix` bolt-on.

## Acceptance Criteria

1. `symbolGraph()` categorizes neighbors for all 8 `EdgeKind` values: `calls`, `imports`, `implements`, `extends`, `tested_by`, `co_changes_with`, `renders`, `routes_to`.
2. Each edge kind with results renders as a `### Title` section in the output. Section titles are direction-aware — e.g., incoming `implements` on an interface renders as "Implemented By", outgoing `implements` on a class renders as "Implements".
3. Direction-aware section titles exist for every edge kind:
   - `calls`: Callers (incoming) / Callees (outgoing)
   - `imports`: Imports (outgoing)
   - `implements`: Implemented By (incoming) / Implements (outgoing)
   - `extends`: Extended By (incoming) / Extends (outgoing)
   - `tested_by`: Tested By (incoming) / Tests (outgoing)
   - `co_changes_with`: Co-changes With (either direction)
   - `renders`: Rendered By (incoming) / Renders (outgoing)
   - `routes_to`: Routed From (incoming) / Routes To (outgoing)
4. `formatNeighborhood()` accepts an ordered list of named sections (`{ title: string, section: NeighborSection }[]`) instead of hardcoded positional parameters.
5. `renderImplementationsSuffix()` in `src/index.ts` and its call site are removed.
6. Stale-check logic (`hasLocalExceptions`) covers all rendered sections, not just callers/callees/imports/unresolved.
7. Every section respects the same `limit`/ranking via `buildSection()`.
8. Output line format remains `anchor  name  edgeKind  confidence:N  source` — unchanged from current format.
9. Existing test assertions for callers, callees, imports, and unresolved sections continue to pass.
10. An unrecognized edge kind (future-proofing) renders with a generic section title derived from the kind string rather than being silently dropped.

## Out of Scope
- Changes to `graph_query`, `trace`, or `impact` tools (D1).
- Adding new edge kinds — only rendering existing ones (D2).

## Open Questions
None.

## Requirement Traceability
- `R1` → AC 1
- `R2` → AC 2, AC 4
- `R3` → AC 5
- `R4` → AC 6
- `R5` → AC 7
- `R6` → AC 2, AC 3
- `O1` → AC 10
- `D1` → Out of Scope
- `D2` → Out of Scope
- `C1` → AC 8
- `C2` → AC 9
- `C3` → AC 4
