# M2: LSP Integration — Spec

## Goal

Add Stage 2 (LSP) indexing to pi-codegraph by integrating tsserver as a child process. This resolves unresolved call edges, discovers callers tree-sitter missed, upgrades edge provenance, and resolves interface→implementation relationships — dramatically improving graph accuracy for TypeScript projects.

## Acceptance Criteria

**TsServerClient lifecycle**

1. `TsServerClient` spawns tsserver lazily on the first request by locating `node_modules/.bin/tsserver` in the project directory, falling back to a globally installed `tsserver`
2. `TsServerClient` kills the tsserver process after a configurable idle timeout (default 30s) with no requests
3. `TsServerClient` automatically respawns tsserver on the next request after an idle shutdown
4. `TsServerClient` automatically respawns tsserver if the process crashes mid-session
5. `TsServerClient` rejects pending request promises when tsserver crashes
6. `TsServerClient` times out individual requests after a configurable timeout (default 5s) and rejects the promise without killing the process
7. `TsServerClient` serializes concurrent requests into a queue — only one request is in-flight at a time
8. `TsServerClient.shutdown()` kills the process and cleans up resources

**TsServerClient API**

9. `definition(file, line, col)` returns `{ file, line, col }` for the definition location, or `null` if no definition found
10. `references(file, line, col)` returns an array of `{ file, line, col }` for all reference locations
11. `implementations(file, line, col)` returns an array of `{ file, line, col }` for concrete implementations of an interface member

**Tree-sitter evidence enhancement**

12. The tree-sitter indexer stores call site position in the evidence field for `calls` edges as `name:line:col` (e.g., `"bar:15:8"`) instead of just the callee name

**GraphStore extensions**

13. `GraphStore.getUnresolvedEdges()` returns all edges whose target ID starts with `__unresolved__`
14. `GraphStore.deleteEdge(source, target, kind, provenanceSource)` removes a specific edge by its primary key
15. `GraphStore.getEdgesBySource(sourceId)` returns all edges originating from a given node

**LSP indexer stage (eager resolution)**

16. The LSP indexer stage runs after tree-sitter in the pipeline and is skipped entirely if tsserver cannot be started (no TypeScript installation found)
17. For each `__unresolved__` call edge, the LSP indexer parses the evidence field to extract the call site position and calls `definition()` to resolve the target
18. When `definition()` returns a result, the LSP indexer creates a new `calls` edge with `lsp` provenance (confidence 0.9) pointing to the resolved node and deletes the old `__unresolved__` edge
19. When `definition()` returns `null`, the unresolved edge is left unchanged
20. For existing tree-sitter `calls` edges pointing to real (non-unresolved) nodes, the LSP indexer calls `definition()` to confirm. If the target matches, it adds a new `lsp`-provenance edge (confidence 0.9) and deletes the `tree-sitter` edge
21. Running the LSP indexer stage twice on the same graph produces no duplicate edges (idempotent)

**LSP resolver (lazy on-demand resolution)**

22. When `symbol_graph` is called for a symbol, the LSP resolver calls `references()` for that symbol's definition location and adds `calls` edges (with `lsp` provenance, confidence 0.9) for any callers not already in the graph
23. When `symbol_graph` is called for an interface node, the LSP resolver calls `implementations()` and adds `implements` edges (with `lsp` provenance, confidence 0.9) for each concrete implementation found
24. LSP-resolved edges from the lazy path are persisted to the graph store — a second `symbol_graph` call for the same symbol does not re-query tsserver

**Edge staleness**

25. When tree-sitter re-indexes a changed file (content hash mismatch), all `lsp`-provenance edges originating from nodes in that file are deleted, forcing re-resolution on the next LSP pass or tool query

**Graceful degradation**

26. If tsserver is not available (not installed), the indexing pipeline completes successfully with only tree-sitter edges — no error is thrown or surfaced
27. If tsserver crashes during the LSP indexer stage, already-written edges are preserved and the stage completes with partial results

## Out of Scope

- **Full-project find-references during indexing** — references are lazy/on-demand only
- **Type-level analysis** — no type inference, generic resolution, or type-narrowing-aware edges
- **Multi-project / monorepo tsserver instances** — one tsserver per project root
- **tsserver event handling** — we only use request/response, not diagnostic or telemetry events
- **Caching tsserver results outside the graph store** — the graph IS the cache
- **Re-export / barrel file resolution** — deferred to M5 hardening

## Open Questions

_(none)_
