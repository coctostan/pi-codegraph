# Brainstorm: M0 Type Model + Store

## Approach

This batch closes issues #003 (type model) and #002 (GraphStore + SQLite) as a single unit because the store depends directly on the types. The work is two sequential layers: types first, then the store implementation on top of them.

The type model defines discriminated string-literal unions for `NodeKind`, `EdgeKind`, and `ProvenanceSource`, and assembles them into `GraphNode` and `GraphEdge` interfaces. Provenance is a nested sub-object on `GraphEdge` (ergonomic for TypeScript callers) that maps to denormalized columns in SQLite. The `GraphStore` interface exposes a focused set of methods needed for M0 and M1: add/get/delete nodes and edges, neighbor traversal, and file-level invalidation. The `SqliteGraphStore` implements it using `bun:sqlite` (zero extra deps).

Node IDs use the format `file::name:startLine` (e.g. `src/auth.ts::validateToken:42`). This is simple to construct from tree-sitter output and guarantees uniqueness. The known tradeoff: when a file is re-indexed, its nodes get fresh IDs if lines shifted, and incoming cross-file edges pointing to the old IDs are deleted. This is acceptable for M0 because the exit criteria is "full index is correct" — incremental re-indexing is a performance optimization, and any stale cross-file edge state resolves on the next full re-index.

## Key Decisions

- **`file::name:startLine` node IDs** — simple, unique, easy to construct from tree-sitter. Stale cross-file edges on incremental re-index are acceptable for M0 (full re-index always correct).
- **Strategy 1 invalidation (delete both directions)** — when a file changes, delete all its nodes AND all edges where source OR target was a node in that file. No dangling references, no orphaned edges.
- **Provenance nested in TypeScript, denormalized in SQLite** — `GraphEdge.provenance` is a `Provenance` sub-object for TS ergonomics; the DB stores `provenance`, `confidence`, `evidence`, `content_hash` as separate columns.
- **`bun:sqlite`** — zero additional dependencies, already in the Bun runtime.
- **`file_hashes` table** — a third table tracks `(file, hash, indexed_at)` to support the M0 incremental optimization (skip unchanged files).
- **Schema migrations via `schema_version` table** — simple version integer, apply migrations sequentially. Only one migration for M0 (initial schema). Keeps the door open for future schema changes.
- **`addNode` / `addEdge` as upserts** — idempotent. Re-indexing a file twice is safe.
- **No `query(sql)` raw passthrough** — YAGNI. M5 adds a Cypher-to-SQL translator. M0 tools query through typed methods only.

## Components

### `src/graph/types.ts` (replace stubs)
- `NodeKind`: `'function' | 'class' | 'interface' | 'module' | 'endpoint' | 'test'`
- `EdgeKind`: `'calls' | 'imports' | 'implements' | 'extends' | 'tested_by' | 'co_changes_with' | 'renders' | 'routes_to'`
- `ProvenanceSource`: `'tree-sitter' | 'lsp' | 'ast-grep' | 'coverage' | 'git' | 'agent'`
- `Provenance`: `{ source: ProvenanceSource, confidence: number, evidence: string, content_hash: string }`
- `GraphNode`: `{ id, kind: NodeKind, name, file, start_line, end_line: number | null, content_hash }`
- `GraphEdge`: `{ source, target, kind: EdgeKind, provenance: Provenance, created_at: number }`
- `nodeId(file, name, startLine): string` — helper to construct IDs

### `src/graph/store.ts` (replace stub interface)
```
interface GraphStore {
  addNode(node: GraphNode): void
  addEdge(edge: GraphEdge): void
  getNode(id: string): GraphNode | null
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[]
  getNodesByFile(file: string): GraphNode[]
  deleteFile(file: string): void          // invalidates nodes + all touching edges
  getFileHash(file: string): string | null
  setFileHash(file: string, hash: string): void
  close(): void
}

interface NeighborOptions {
  kind?: EdgeKind
  direction?: 'in' | 'out' | 'both'      // default: 'both'
}

interface NeighborResult {
  node: GraphNode
  edge: GraphEdge
}
```

### `src/graph/sqlite.ts` (replace stub class)
- Implements `GraphStore` with `bun:sqlite`
- Constructor: `SqliteGraphStore(dbPath: string = ':memory:')`
- Schema: `nodes`, `edges`, `file_hashes`, `schema_version` tables
- Indexes: `idx_nodes_file`, `idx_edges_source`, `idx_edges_target`
- `deleteFile` uses a subquery join to delete edges touching deleted nodes atomically

### Schema (SQLite)
```sql
nodes:      id PK, kind, name, file, start_line, end_line, content_hash
edges:      (source, target, kind, provenance) PK, confidence, evidence, content_hash, created_at
file_hashes: file PK, hash, indexed_at
schema_version: version INTEGER
```

## Testing Strategy

All tests in `test/graph-store.test.ts` and `test/graph-types.typecheck.ts` (already exist as stubs).

**Type tests** (`graph-types.typecheck.ts`):
- Compile-time assertions: valid `GraphNode`, `GraphEdge`, `Provenance` objects typecheck
- Invalid kind strings fail to compile
- `nodeId` round-trips: `nodeId('src/a.ts', 'foo', 10) === 'src/a.ts::foo:10'`

**Store tests** (`graph-store.test.ts`):
- `addNode` + `getNode` round-trips
- `addNode` upserts (second write for same ID overwrites)
- `addEdge` + `getNeighbors` round-trips (both directions, filtered by kind)
- `deleteFile` removes nodes and all edges in both directions (cross-file edges too)
- `getFileHash` / `setFileHash` round-trips
- `close` + reopen same DB file: data persists
- All tests run against `:memory:` for speed
- One test uses a temp file path to verify persistence across `close`/reopen
