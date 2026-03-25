# Spec: BM25 Ranked Symbol Search

## Goal

Add a `symbol_search` tool that lets agents find graph symbols by approximate name using BM25 ranked scoring over symbol name, signature, and file path. This removes the exact-name requirement that currently forces agents to fall back to grep.

## Acceptance Criteria

1. A `symbol_search` tool is registered in the pi extension as a standalone tool, separate from `graph_query`.
2. The tool accepts `{ query: string, kind?: NodeKind, file?: string, limit?: number }`.
3. The query string is tokenized by splitting on camelCase boundaries, snake_case underscores, and whitespace, then lowercased.
4. Each graph node is scored using BM25 over three fields with weights: name (3×), signature (2×), file path (1×).
5. Results are returned as a ranked array, highest score first, default limit 20.
6. Each result includes: symbol name, BM25 score, kind, file, start line, and signature (when present).
7. When `kind` is provided, only symbols of that kind appear in results.
8. When `file` is provided as a glob pattern, only symbols in matching files appear in results.
9. The BM25 index is built lazily on first search and cached in memory (not persisted to disk).
10. The cached index is invalidated and rebuilt when the underlying graph has been re-indexed (detected via content hash or generation change).
11. An empty query returns an empty result array (not an error).
12. A query with no matches returns an empty result array.
13. Output is structured (array of objects), consistent with existing tool output conventions.

## Out of Scope

- Embedding-based / vector semantic search (D1)
- Searching edge evidence or test assertion text — symbols only (D2)
- Persisting the BM25 index to SQLite (D3)
- Substring fallback when BM25 returns zero results (O2 — may revisit later)

## Open Questions

None.

## Requirement Traceability

- `R1` → AC 1
- `R2` → AC 3
- `R3` → AC 4
- `R4` → AC 5, AC 6 (signature included per O1 promotion)
- `R5` → AC 7
- `R6` → AC 8
- `R7` → AC 9
- `R8` → AC 10
- `R9` → AC 13
- `O1` → AC 6 (promoted — cheap and avoids follow-up calls)
- `O2` → Out of Scope
- `D1` → Out of Scope
- `D2` → Out of Scope
- `D3` → Out of Scope
- `C1` → implicit in AC 4 (BM25 implemented in-project, no deps)
- `C2` → implicit in AC 9 (reads from existing store)
- `C3` → implicit (TypeScript/Bun)
- `C4` → AC 13
