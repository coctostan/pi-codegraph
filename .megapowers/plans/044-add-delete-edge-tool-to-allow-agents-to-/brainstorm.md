# Brainstorm: Add delete_edge tool

## Goal
Add a `delete_edge` tool that allows agents to retract incorrect agent-authored edges from the graph. Currently, `resolve_edge` only creates/upserts edges, and agent edges explicitly survive re-indexing. Without a deletion mechanism, bad edges (test artifacts, nonsensical relationships) permanently pollute tool output.

## Mode
Direct requirements — the issue is fully specified, the store method exists, and the implementation pattern is clear from `resolve_edge`.

## Must-Have Requirements
- **R1:** A new `delete_edge` tool is registered in `src/index.ts` alongside the other tools.
- **R2:** The tool accepts `source` (string), `target` (string), `kind` (string), and optionally `sourceFile` and `targetFile` for disambiguation.
- **R3:** Node resolution uses the same `store.findNodes()` logic as `resolve_edge`, with identical disambiguation behavior (return disambiguation list when ambiguous, "not found" when missing).
- **R4:** Only agent-provenance edges are deletable — the tool always passes `"agent"` as the `provenanceSource` to `store.deleteEdge()`.
- **R5:** On success, the tool returns confirmation including the deleted edge details (source anchor, target anchor, kind).
- **R6:** When no matching agent edge exists for the given source/target/kind, the tool returns a "not found" message rather than silently succeeding.
- **R7:** The tool validates that `kind` is a valid `EdgeKind` (same validation as `resolve_edge`).
- **R8:** Readonly database errors are caught and return a descriptive message (same pattern as `resolve_edge`).

## Optional / Nice-to-Have
- **O1:** Batch deletion — accept multiple edges in one call.

## Explicitly Deferred
- **D1:** Deletion of non-agent edges (system/LSP/tree-sitter provenance). Agents should not be able to delete structural edges.
- **D2:** Undo/audit trail for deleted edges beyond what SQLite provides.

## Constraints
- **C1:** Must follow the same code patterns as `resolve_edge.ts` — separate function in `src/tools/delete-edge.ts`, Typebox params in `index.ts`, tool registration in `piCodegraph()`.
- **C2:** Must use the existing `store.deleteEdge()` method — no new store methods needed.
- **C3:** Must verify the edge actually exists before attempting deletion (R6 requires "not found" feedback).

## Open Questions
None.

## Recommended Direction
Create `src/tools/delete-edge.ts` mirroring the structure of `resolve-edge.ts`. Import `findNodes`, reuse `VALID_EDGE_KINDS` and `formatDisambiguation` (or extract them to a shared utility), resolve source/target nodes, check for an existing agent edge via `store.getNeighbors()`, call `store.deleteEdge()`, and return anchored confirmation.

The existence check (R6) can use `store.getNeighbors(sourceNode.id, { direction: "out", kind })` filtered to `provenance.source === "agent"` and matching target — the same pattern `resolve_edge` already uses for upsert detection. If no match, return "not found".

Register the tool in `index.ts` with a `DeleteEdgeParams` Typebox schema (source, target, kind required; sourceFile, targetFile optional). The `execute` handler follows the same ensureIndexed → try/catch readonly pattern as `resolve_edge`.

## Testing Implications
- Test that a created agent edge can be deleted and is no longer returned by `getNeighbors`/`symbol_graph`.
- Test "not found" when attempting to delete a non-existent edge.
- Test that non-agent edges cannot be deleted (the tool should report not found even if a system edge exists between those nodes).
- Test disambiguation behavior (ambiguous source/target returns disambiguation list).
- Test invalid edge kind rejection.
- Test self-referential edge deletion attempt (source === target should still resolve nodes correctly, just find no edge).
