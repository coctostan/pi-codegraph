# Spec: resolve_edge tool + pi extension wiring

## Goal

Build the `resolve_edge` tool that lets an agent manually create edges in the symbol graph (with evidence and provenance tracking), wire both `symbol_graph` and `resolve_edge` as pi extension tools, and manage the SQLite store lifecycle including auto-indexing, agent-edge preservation during re-indexing, and lazy staleness detection.

## Acceptance Criteria

1. `resolveEdge` accepts `source`, `target`, `sourceFile?`, `targetFile?`, `kind` (EdgeKind), and `evidence` (string) parameters
2. `resolveEdge` looks up source node via `store.findNodes(source, sourceFile)` — returns error string if zero matches
3. `resolveEdge` looks up target node via `store.findNodes(target, targetFile)` — returns error string if zero matches
4. When `findNodes` returns multiple matches for source, `resolveEdge` returns a disambiguation list with each node's file, kind, and line number
5. When `findNodes` returns multiple matches for target, `resolveEdge` returns a disambiguation list with each node's file, kind, and line number
6. `resolveEdge` rejects invalid edge kinds with an error listing valid kinds
7. Created edges have `provenance.source = "agent"`, `provenance.confidence = 0.7`, and `provenance.evidence` set to the input evidence string
8. Created edges have `provenance.content_hash` set to the current file hash of the source node's file (from `store.getFileHash`)
9. Calling `resolveEdge` with the same source→target→kind overwrites the previous agent edge (upsert), updating evidence and content_hash
10. `resolveEdge` returns a structured confirmation including the source anchor, target anchor, edge kind, and whether the edge was created or updated
11. `deleteFile` preserves edges with `provenance_source = 'agent'` — only non-agent edges are deleted
12. `deleteFile` still deletes all nodes and file hash rows for the given file (existing behavior unchanged for nodes)
13. When `symbol_graph` returns neighbor edges, agent edges whose `content_hash` differs from the current `store.getFileHash` for the source node's file are marked `[stale]` in output
14. The pi extension registers a `symbol_graph` tool via `pi.registerTool` with TypeBox parameter schema accepting `name` (string, required) and `file` (string, optional)
15. The pi extension registers a `resolve_edge` tool via `pi.registerTool` with TypeBox parameter schema accepting `source`, `target`, `kind`, `evidence` (all required strings), plus `sourceFile` and `targetFile` (optional strings)
16. Both tool execute functions open/create the SQLite store at `.codegraph/graph.db` relative to the project root
17. If the store has no indexed files (`store.listFiles()` returns empty), the tool auto-indexes the project via `indexProject` before executing
18. The store instance is shared (singleton) across tool calls within the same extension lifecycle — not opened/closed per call
19. Tool execute functions return `AgentToolResult` with text content containing the formatted output from `symbolGraph()` or `resolveEdge()`

## Out of Scope

- Re-indexing on every tool call (only auto-index when DB is empty/missing)
- Confidence scoring based on evidence quality (fixed `0.7` for all agent edges)
- Agent self-reported confidence parameter
- Eager indexing at extension load time
- `.gitignore` auto-generation for `.codegraph/`
- Explicit re-index command/tool (future milestone)
- Stale edge auto-deletion or cleanup

## Open Questions

None.
