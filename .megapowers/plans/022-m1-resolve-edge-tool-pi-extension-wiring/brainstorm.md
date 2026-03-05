# Brainstorm: resolve_edge tool + pi extension wiring

## Approach

The `resolve_edge` tool lets an agent manually create edges in the symbol graph when static analysis leaves holes. The agent provides source and target symbols by name (+ optional file for disambiguation), an edge kind, and free-text evidence explaining the relationship. The edge is stored with `provenance_source = 'agent'` and a fixed confidence of `0.7` — above tree-sitter's name-matched `0.5`, below LSP's future `0.9`. The evidence string is persisted for later review but does not influence the confidence score.

Agent-resolved edges are protected during re-indexing: when `deleteFile` runs for incremental updates, it skips edges with `provenance_source = 'agent'`. Instead, staleness is checked lazily at query time by comparing the edge's `content_hash` against the current file hash. Stale edges still appear in results but are flagged, inviting the agent to re-verify or re-resolve them. If the agent calls `resolve_edge` for the same source→target→kind, it overwrites the existing agent edge (upsert semantics).

The pi extension wiring registers both `symbol_graph` and `resolve_edge` as tools via the pi extension API. A shared `getOrCreateStore` function manages the SQLite lifecycle: the database lives at `.codegraph/graph.db` in the project root, persisting across sessions. On the first tool call, if the DB is empty or missing, the extension auto-indexes the project using the existing `indexProject` pipeline before proceeding with the tool invocation.

## Key Decisions

- **Symbol identification by name + optional file** — consistent with `symbol_graph`'s existing `findNodes(name, file?)` pattern. Ambiguous matches return a disambiguation list.
- **DB location: `.codegraph/graph.db` in project root** — discoverable, gitignore-able, dies with the project. No external dependencies.
- **Fixed confidence `0.7` for agent edges** — no self-calibration or heuristic scoring. Simple, deferring sophistication to later milestones.
- **Agent edges protected from `deleteFile`** — `deleteFile` skips `provenance_source = 'agent'` edges. Staleness detected lazily at query time via content hash comparison.
- **Lazy auto-indexing** — index only on first tool call when DB is empty/missing. No re-index on every call, no eager indexing at extension load. Pi startup stays fast.
- **Upsert on resolve** — re-resolving the same source→target→kind with `provenance_source = 'agent'` overwrites the previous edge (updates evidence, refreshes content_hash).

## Components

### `src/tools/resolve-edge.ts` (issue #008)
- `resolveEdge(params)` — core logic: look up source/target nodes, validate edge kind, build edge with agent provenance, upsert into store
- Input: `{ source: string, target: string, sourceFile?: string, targetFile?: string, kind: EdgeKind, evidence: string, store: GraphStore, projectRoot: string }`
- Output: structured confirmation string (edge created/updated, anchors for both endpoints)
- Error cases: source not found, target not found, ambiguous match (return candidates), invalid edge kind

### `src/graph/sqlite.ts` modifications (issue #008)
- `deleteFile` — add filter to preserve agent edges
- Staleness check utility — compare edge content_hash vs current file hash (used by output layer)

### `src/index.ts` (issue #009)
- Register `symbol_graph` and `resolve_edge` tools via `pi.addTool()`
- `getOrCreateStore(projectRoot)` — singleton store manager: open/create `.codegraph/graph.db`, auto-index if empty
- Argument parsing, routing to `symbolGraph()` / `resolveEdge()`, returning formatted output

## Testing Strategy

- **resolve-edge unit tests** — create store, add nodes, call `resolveEdge`, verify edge exists with correct provenance/confidence/evidence. Test upsert overwrites. Test disambiguation on ambiguous names. Test error on missing symbols.
- **deleteFile preservation tests** — add tree-sitter + agent edges, call `deleteFile`, verify agent edges survive, tree-sitter edges removed.
- **Staleness detection tests** — create agent edge, change file hash, verify query output flags edge as stale.
- **Extension wiring tests** — mock pi API, verify tools are registered with correct schemas. Test auto-index trigger on empty DB. Test argument parsing and routing.
- **Integration test** — index a small fixture project, call `symbol_graph` to see unresolved edges, call `resolve_edge` to fill one, call `symbol_graph` again to verify the edge appears.
