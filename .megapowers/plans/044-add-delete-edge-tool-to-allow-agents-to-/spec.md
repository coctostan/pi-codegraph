# Spec: Add delete_edge tool

## Goal
Add a `delete_edge` tool that lets agents retract incorrect agent-authored edges from the graph. This complements `resolve_edge` (create/upsert) with a deletion path, preventing bad edges from permanently polluting tool output.

## Acceptance Criteria

1. A `delete_edge` tool is registered in `src/index.ts` alongside the existing tools.
2. The tool accepts required params `source` (string), `target` (string), `kind` (string), and optional `sourceFile` and `targetFile` (strings) for disambiguation.
3. Source and target nodes are resolved via `store.findNodes()` — when no match is found, the tool returns a "not found" message naming the missing symbol.
4. When source or target resolution is ambiguous (multiple matches), the tool returns a disambiguation list with file, kind, and line for each candidate, matching `resolve_edge` format.
5. The tool validates `kind` against the same `EdgeKind` set as `resolve_edge` and returns an error listing valid kinds if invalid.
6. Before deletion, the tool checks for an existing agent-provenance edge matching source node, target node, and kind. If none exists, it returns a "not found" message rather than silently succeeding.
7. The tool calls `store.deleteEdge(sourceId, targetId, kind, "agent")` — only agent-provenance edges are deletable.
8. On successful deletion, the tool returns confirmation including source anchor, target anchor, and edge kind.
9. Readonly database errors are caught and return a descriptive message (same pattern as `resolve_edge`).
10. The implementation lives in `src/tools/delete-edge.ts` as a pure function with a params interface, following the same structure as `resolve-edge.ts`.

## Out of Scope
- **O1:** Batch deletion (multiple edges per call).
- **D1:** Deletion of non-agent edges (tree-sitter, LSP, ast-grep provenance).
- **D2:** Undo/audit trail for deleted edges.

## Open Questions
None.

## Requirement Traceability
- `R1` → AC 1
- `R2` → AC 2
- `R3` → AC 3, AC 4
- `R4` → AC 7
- `R5` → AC 8
- `R6` → AC 6
- `R7` → AC 5
- `R8` → AC 9
- `C1` → AC 1, AC 10
- `C2` → AC 7
- `C3` → AC 6
- `O1` → Out of Scope
- `D1` → Out of Scope
- `D2` → Out of Scope
