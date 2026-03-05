# Feature: M0 Type Model + Store (019)

**Issues addressed:** #002 (Graph store abstraction + SQLite implementation), #003 (Node and edge types with provenance model)  
**Branch:** `feat/019-m0-type-model-store`

---

## What Was Built

Three source files were replaced from stubs to full implementations, establishing the foundational data layer for pi-codegraph:

### `src/graph/types.ts` — Graph Domain Model

- **`NodeKind`** — string literal union: `'function' | 'class' | 'interface' | 'module' | 'endpoint' | 'test'`
- **`EdgeKind`** — string literal union: `'calls' | 'imports' | 'implements' | 'extends' | 'tested_by' | 'co_changes_with' | 'renders' | 'routes_to'`
- **`ProvenanceSource`** — string literal union: `'tree-sitter' | 'lsp' | 'ast-grep' | 'coverage' | 'git' | 'agent'`
- **`Provenance`** — `{ source, confidence, evidence, content_hash }` — every edge carries a full provenance record
- **`GraphNode`** — `{ id, kind, name, file, start_line, end_line, content_hash }`
- **`GraphEdge`** — `{ source, target, kind, provenance, created_at }`
- **`nodeId(file, name, startLine)`** — canonical node ID format: `"<file>::<name>:<startLine>"`

All three union types are proper string literal unions (not widened to `string`), making incorrect assignments TypeScript compile errors.

### `src/graph/store.ts` — GraphStore Interface

The `GraphStore` interface defines the contract all storage backends must implement:

| Method | Purpose |
|--------|---------|
| `addNode(node)` | Upsert a graph node |
| `addEdge(edge)` | Upsert a graph edge |
| `getNode(id)` | Look up a node by ID, or null |
| `getNeighbors(id, opts?)` | Directional 1-hop traversal with optional kind filter |
| `getNodesByFile(file)` | All nodes belonging to a source file |
| `deleteFile(file)` | Remove file's nodes and all touching edges atomically |
| `getFileHash(file)` | Get cached content hash for a file |
| `setFileHash(file, hash)` | Store content hash for incremental change detection |
| `close()` | Release the database connection |

Helper types `NeighborOptions` (`{ kind?, direction? }`) and `NeighborResult` (`{ node, edge }`) are exported alongside the interface.

### `src/graph/sqlite.ts` — SqliteGraphStore Implementation

A `bun:sqlite`-backed implementation of `GraphStore`:

- **Schema**: `nodes`, `edges`, `file_hashes`, `schema_version` tables with indexes on `nodes.file`, `edges.source`, `edges.target`
- **Edge primary key**: `(source, target, kind, provenance_source)` — allows multiple provenances for the same structural edge
- **Upsert semantics**: `INSERT OR REPLACE` for both nodes and edges — safe to re-index the same file repeatedly
- **`deleteFile` atomicity**: wrapped in an explicit transaction; cascades to delete edges where `source` OR `target` belonged to the deleted file
- **Schema version**: `schema_version` table initialized with `version = 1` on first open; subsequent opens are no-ops
- **Persistence**: `close()` flushes SQLite's WAL and releases the file; re-opening the same path recovers all data

---

## Why It Matters

Every subsequent M0 component (tree-sitter indexer, tools, output layer) depends on:
1. A typed model that makes invalid nodes/edges a compile error — prevents the classic "wrong kind string" class of bugs
2. A working SQLite-backed store — gives indexers a stable insertion target and tools a stable query target

Without this, every other M0 component was blocked.

---

## Test Coverage

| File | Tests | Description |
|------|-------|-------------|
| `test/graph-store.test.ts` | 11 tests | Full behavioral coverage of SqliteGraphStore |
| `test/graph-types.typecheck.ts` | compile-time | `@ts-expect-error` guards on NodeKind, EdgeKind, ProvenanceSource; structural assignability of SqliteGraphStore to GraphStore |

**43 of 43 acceptance criteria verified** (verify phase report: `.megapowers/plans/019-m0-type-model-store/verify.md`).

---

## Key Design Decisions

1. **`provenance_source` column name** — the edges table stores the provenance source as a plain TEXT column named `provenance_source`, not a JSON blob named `provenance`. This keeps the column filterable/indexable for future M3 provenance-weighted queries without a JSON extraction step.

2. **Edge PK includes provenance source** — `(source, target, kind, provenance_source)` not just `(source, target, kind)`. This allows tree-sitter and LSP to both record the same A→B call edge independently; the higher-confidence record survives when one is re-indexed.

3. **`deleteFile` deletes crossing edges** — an edge from `src/b.ts::foo:1` → `src/a.ts::bar:5` is deleted when `src/a.ts` is re-indexed. This prevents stale cross-file edges from accumulating during incremental indexing.

4. **`nodeId` format** — `"src/a.ts::foo:10"` uses `::` as the file/symbol separator and `:` before the line number. The double-colon survives JSON serialization, URL encoding, and common shell quoting without ambiguity.

---

## Known Follow-ups (from code review)

- **Row-to-node mapping is duplicated** in `getNode`, `getNodesByFile`, and `fetchNeighborRows`. Extract a private `rowToNode()` helper when the next field is added to `GraphNode`.
- **`file_hashes.indexed_at`** is populated but not yet exposed; add a comment noting it's reserved for incremental staleness detection.
- **`deleteFile` uses manual `BEGIN`/`COMMIT`/`ROLLBACK`**; migrate to `db.transaction()` when another transactional method is added.
