# Spec: Output Layer + symbol_graph Tool

## Goal

Build shared output infrastructure (hashline anchoring and result ranking) and the `symbol_graph` tool so a coding agent can query the graph by symbol name and receive a plain-text, anchored, ranked neighborhood — with staleness detection, disambiguation for ambiguous names, and omission counts when results are truncated.

## Acceptance Criteria

### Store: `findNodes`

1. `GraphStore` interface exposes `findNodes(name: string, file?: string): GraphNode[]`
2. `findNodes("foo")` returns all nodes where `name = "foo"` across all files
3. `findNodes("foo", "src/a.ts")` returns only nodes where `name = "foo"` and `file = "src/a.ts"`
4. `findNodes("nonexistent")` returns an empty array

### Output: `computeAnchor`

5. `computeAnchor(node, projectRoot)` reads the file at `path.join(projectRoot, node.file)`, extracts the line at `node.start_line`, and returns `{ anchor, stale }` where `anchor` is in `file:line:hash` format (e.g. `src/foo.ts:42:a1b2`)
6. The hash portion is the first 4 hex characters of SHA-256 of the line content (trimmed of leading/trailing whitespace)
7. When the file exists but its full-content SHA-256 differs from `node.content_hash`, the result has `stale: true`
8. When the file does not exist on disk, the result has `stale: true` and `anchor` uses `?` as the hash (e.g. `src/foo.ts:42:?`)
9. When the file exists and its content hash matches `node.content_hash`, the result has `stale: false`

### Output: `rankNeighbors`

10. `rankNeighbors(neighbors, limit)` returns `{ kept: NeighborResult[], omitted: number }` sorted by `edge.provenance.confidence` descending
11. When the input has more items than `limit`, only the top `limit` items are kept and `omitted` equals the remainder
12. When the input has fewer or equal items to `limit`, all items are kept and `omitted` is `0`
13. Ties in confidence are broken by `edge.created_at` descending (newer first)

### Output: `formatNeighborhood`

14. The formatter produces a plain text block with a symbol header line showing the symbol's name, kind, and anchor
15. Neighbor entries are grouped into sections: `Callers`, `Callees`, `Imports`
16. Each neighbor entry line includes: anchor, symbol name, edge kind, confidence value, and provenance source
17. When a category was truncated, a `(N more omitted)` line appears after the last entry in that section
18. Empty neighbor categories are omitted entirely (no empty section headers)
19. Stale entries are suffixed with `[stale]`
20. Neighbors whose node file starts with `__unresolved__` are grouped into a separate `Unresolved` section showing the unresolved target name

### Tool: `symbolGraph`

21. `symbolGraph({ name, file?, limit? })` called with a name matching exactly one node returns the full formatted neighborhood
22. Called with a name matching zero nodes, it returns a text message containing "not found"
23. Called with a name matching multiple nodes and no `file` filter, it returns a disambiguation list where each entry shows the node's anchor, kind, and file
24. Called with `name` + `file` that narrows to exactly one match, it returns the full formatted neighborhood
25. Callers are neighbors connected by incoming `calls` edges; callees by outgoing `calls` edges; imports by outgoing `imports` edges
26. Each neighbor category is independently ranked and truncated to `limit` (default: 10)

## Out of Scope

- Token-based budgeting (M1 uses flat `limit` count only)
- `resolve_edge` tool (separate issue)
- pi extension wiring / tool registration (separate issue)
- LSP, ast-grep, coverage, or git-based indexing layers
- Caching anchors in the graph store
- Automatic re-indexing triggered by staleness detection

## Open Questions

*(None)*
