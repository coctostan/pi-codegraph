# M2: LSP Integration — Feature Document

## What Was Built

Stage 2 of the pi-codegraph indexing pipeline: a full TypeScript Language Server (tsserver)
integration that upgrades tree-sitter's name-based call edges to precise, go-to-definition–
verified edges, discovers callers missed by static analysis, and resolves interface →
implementation relationships on demand.

---

## Why It Was Needed

Tree-sitter's Stage 1 produces `__unresolved__` placeholder edges for every call site whose
callee can't be pinned to a file/line. In a real TypeScript codebase these outnumber resolved
edges 3:1. Agents using `symbol_graph` were seeing:

```
Unresolved:
  foo  (3 callers, name-match only, confidence 0.5)
```

instead of:

```
Callers:
  src/server/router.ts:42:12  handleRequest  calls  confidence:0.9  lsp
```

Stage 2 eliminates that ambiguity.

---

## Components

### `TsServerClient` (`src/indexer/tsserver-client.ts`)

A zero-dependency tsserver adapter with:
- **Lazy spawn** — process starts on the first request, prefers `node_modules/.bin/tsserver`
  over global fallback
- **Idle timeout** (default 30 s) — kills the process when quiet, respawns on next call
- **Crash recovery** — `exit` handler rejects all pending promises and clears state; the next
  `request()` call respawns transparently
- **Request serialisation** — a promise-chain queue ensures exactly one request is in-flight
  at all times
- **Per-request timeout** (default 5 s) — rejects without killing the process, allowing
  subsequent requests to succeed
- **Graceful shutdown** — sends the `exit` command, waits up to 1.5 s, then force-kills

Public API: `definition(file, line, col)`, `references(file, line, col)`,
`implementations(file, line, col)`, `shutdown()`.

### LSP Index Stage (`src/indexer/lsp.ts`)

Runs eagerly after tree-sitter in `indexProject`. For each `__unresolved__` call edge:
1. Parses `name:line:col` from the tree-sitter evidence field
2. Calls `definition()` to pinpoint the callee
3. If resolved: creates an `lsp`-provenance edge (confidence 0.9), deletes the unresolved edge

Also upgrades existing tree-sitter `calls` edges: if `definition()` confirms the target,
the tree-sitter edge is replaced with an `lsp` edge. The stage is fully idempotent (AC21)
and skips gracefully if tsserver cannot start (AC16/AC26).

### LSP Resolver (`src/indexer/lsp-resolver.ts`)

Two lazy, on-demand functions called from the `symbol_graph` tool:

**`resolveMissingCallers(node, store, projectRoot, client)`**  
Calls `references()` for the symbol, finds the enclosing function for each reference
location, and writes `lsp calls` edges for any caller not already in the graph.

**`resolveImplementations(node, store, projectRoot, client)`**  
For interface nodes: calls `implementations()` and writes `lsp implements` edges
for each concrete class found.

Both use a persisted edge-backed marker (`__meta__::resolver::callers::<id>`) to prevent
re-querying tsserver on subsequent `symbol_graph` calls. The marker is automatically
invalidated when tree-sitter re-indexes the file (the `deleteFile()` cascade removes the
marker→symbol edge).

### GraphStore Extensions (`src/graph/sqlite.ts`, `src/graph/store.ts`)

Three new methods on the `GraphStore` interface:
- `getUnresolvedEdges()` — returns all edges whose target begins with `__unresolved__::`
- `getEdgesBySource(sourceId)` — returns all edges from a node, ordered by `created_at ASC`
- `deleteEdge(source, target, kind, provenanceSource)` — removes a single edge by PK

### Tree-sitter Evidence Enhancement (`src/indexer/tree-sitter.ts`)

Call-site evidence format changed from `"calleeName"` to `"calleeName:line:col"` (1-based),
giving the LSP stage the precise source location it needs for `definition()`.

---

## Edge Provenance After M2

| Provenance | Confidence | Meaning |
|---|---|---|
| `tree-sitter` | 0.5 | Name-matched; callee not yet confirmed |
| `lsp` | 0.9 | go-to-definition confirmed OR references-discovered |
| `agent` | 1.0 | Manually written by agent via `resolve_edge` |

---

## Graceful Degradation

- tsserver not installed → pipeline completes with tree-sitter edges only, zero errors
- tsserver crash during eager indexing → already-written edges preserved, stage continues
- tsserver transient failure during lazy resolution → marker NOT set, next tool call retries
- tsserver permanently unavailable during lazy resolution → marker set, no retry loop

---

## Test Coverage

86 tests across 21 files, including:
- 7 tests for `TsServerClient` lifecycle (AC2–AC8)
- 4 tests for the LSP index stage (AC17–AC21)
- 7 tests for the LSP resolver (AC22–AC25 + regression)
- Type-level tests via `graph-types.typecheck.ts`

---

## Related Issues

- #010 — Stage 2 indexer: tsserver spawning and lifecycle
- #011 — LSP edge resolution: go-to-definition and find-references
