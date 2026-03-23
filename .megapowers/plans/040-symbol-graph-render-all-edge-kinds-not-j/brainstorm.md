# Brainstorm: symbol_graph — render all edge kinds

## Goal
`symbol_graph` silently drops 6 of 8 edge kinds (implements, extends, tested_by, co_changes_with, renders, routes_to). All edge kinds should render as labeled sections, giving agents a complete neighborhood view without needing to fall back to `graph_query`.

## Mode
Direct requirements — the bug, root cause, and expected behavior are fully specified in the issue. No design ambiguity.

## Must-Have Requirements
- **R1:** The `symbolGraph()` neighbor loop must categorize all 8 `EdgeKind` values, not just `calls` and `imports`.
- **R2:** `formatNeighborhood()` must render a section for every edge kind that has results, with an appropriate heading (e.g., `### Extends`, `### Tested By`, `### Co-changes With`, `### Renders`, `### Routes To`, `### Implementations`).
- **R3:** The `renderImplementationsSuffix()` bolt-on in `src/index.ts` must be removed — `implements` edges should be handled natively by `symbol-graph.ts`.
- **R4:** Stale-check logic (`hasLocalExceptions`) must cover all rendered sections, not just callers/callees/imports/unresolved.
- **R5:** Each additional section must respect the same `limit`/ranking as existing sections (via `buildSection()`).
- **R6:** Edge directionality must be correct per kind — e.g., for `implements`, an interface should show "Implemented By" (incoming), while a class should show "Implements" (outgoing). Same principle for `extends`, `tested_by`, etc.

## Optional / Nice-to-Have
- **O1:** If a new `EdgeKind` is added to `types.ts` in the future, the rendering should degrade gracefully (render with a generic section name) rather than silently drop it.

## Explicitly Deferred
- **D1:** No changes to `graph_query`, `trace`, or `impact` tools in this issue.
- **D2:** No new edge kinds being added — just rendering existing ones.

## Constraints
- **C1:** Output format must remain agent-parseable — same `anchor name edgeKind confidence:N source` line format.
- **C2:** Existing tests for `symbol_graph` callers/callees/imports/unresolved must continue to pass.
- **C3:** `formatNeighborhood()` signature change must not break any callers outside `symbol-graph.ts` and `src/index.ts`.

## Open Questions
None.

## Recommended Direction
Generalize `symbolGraph()` to bucket neighbors into a `Map<string, NeighborResult[]>` keyed by a section label that accounts for edge kind and directionality. For `calls`, split into Callers (incoming) and Callees (outgoing). For `implements`, show "Implemented By" on an interface, "Implements" on a class. For `tested_by`, show "Tested By" (incoming) and "Tests" (outgoing). And so on for each kind.

Refactor `formatNeighborhood()` to accept an ordered list of named sections rather than hardcoded positional parameters. Each section is a `{ title: string, section: NeighborSection }`. This makes the function future-proof without overcomplicating it.

Remove `renderImplementationsSuffix()` from `src/index.ts` and its call site. The tool handler should just return the result of `symbolGraph()` directly (plus trust header, which is already inside `symbolGraph()`).

## Testing Implications
- Unit tests for `symbolGraph()` with edges of each kind to verify they appear in output.
- Test directional labeling: an interface node with incoming `implements` edges should show "Implemented By"; a class with outgoing `implements` should show "Implements".
- Regression tests: existing callers/callees/imports/unresolved output unchanged.
- Integration test: verify `renderImplementationsSuffix` removal doesn't leave a gap — `implements` edges now appear natively.
