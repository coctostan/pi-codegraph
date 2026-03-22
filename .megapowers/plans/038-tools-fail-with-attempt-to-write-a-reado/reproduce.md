# Reproduction: Tools fail with "attempt to write a readonly database"

## Steps to Reproduce

1. Start pi in the `pi-codegraph` project directory (extension loads via `package.json` → `pi.extensions`)
2. Invoke any of the 5 codegraph tools: `symbol_graph`, `resolve_edge`, `impact`, `trace`, `graph_query`
3. Every tool fails with `attempt to write a readonly database`

Minimal invocation:
```
symbol_graph({ name: "GraphStore" })
→ Error: attempt to write a readonly database
```

## Expected Behavior

Tools should return graph query results from the existing `.codegraph/graph.db` database. If the database cannot be written to (preventing re-indexing), tools should gracefully degrade and serve stale data with a trust warning.

## Actual Behavior

All 5 tools crash with `attempt to write a readonly database`. No data is returned. The tools are completely non-functional in pi's extension runtime.

## Evidence

### Direct tool invocations (all fail identically):
```
symbol_graph({ name: "GraphStore" })    → Error: attempt to write a readonly database
graph_query({ query: "MATCH (n) RETURN n LIMIT 1" }) → Error: attempt to write a readonly database
impact({ symbols: ["GraphStore"], changeType: "behavior_change" }) → Error: attempt to write a readonly database
trace({ entry: "GraphStore" })          → Error: attempt to write a readonly database
resolve_edge({ source: "GraphStore", target: "SqliteGraphStore", kind: "implements", evidence: "test" }) → Error: attempt to write a readonly database
```

### Stack trace (from test reproduction):
```
SQLiteError: attempt to write a readonly database
    at run (unknown)
    at #run (bun:sqlite:185:20)
    at deleteEdge (/src/graph/sqlite.ts:202:113)
    at runLspIndexStage (/src/indexer/lsp.ts:79:13)
    at async indexProject (/src/indexer/pipeline.ts:110:11)
    at async ensureIndexed (/src/index.ts:84:11)
    at async execute (/src/index.ts:119:13)
```

### Root cause chain:
1. Every tool's `execute()` in `src/index.ts` calls `ensureIndexed(projectRoot, store)`
2. `ensureIndexed()` calls `indexProject()` which runs the full 5-stage indexing pipeline
3. The **tree-sitter stage** silently swallows write errors (`catch { errors++ }`)
4. The **LSP stage** (`runLspIndexStage`) calls `store.deleteEdge()` + `store.addEdge()` — these are WRITE operations
5. The LSP stage has **no error handling** for write failures — error propagates
6. Error bubbles up through `indexProject` → `ensureIndexed` → `execute()` → pi runtime → user gets an error instead of results

### Database is writable at OS level:
```
$ ls -la .codegraph/graph.db
-rw-rw-rw-  staff  868352  graph.db

$ sqlite3 .codegraph/graph.db "INSERT INTO file_hashes VALUES ('__test__', 'abc', 0); DELETE FROM file_hashes WHERE file='__test__';"
# (succeeds)
```

### Same code works under bun test:
```
$ bun test
225 pass, 0 fail (including extension-auto-index tests that do full indexing)
```

### Confirmed: read operations work fine on readonly DB:
- `store.findNodes()` ✓
- `store.getNeighbors()` ✓  
- `store.getNodesByFile()` ✓
- `store.queryRows()` (SELECT) ✓

Only WRITE operations fail (`addNode`, `addEdge`, `deleteEdge`, `setFileHash`, `deleteFile`).

## Environment

- **pi version:** 0.61.1
- **Node.js:** v25.8.1 (pi runs under Node.js, not Bun)
- **Bun:** 1.3.11 (tests run under Bun)
- **OS:** macOS (ARM64)
- **SQLite (system):** 3.51.3
- **Extension loading:** jiti (TypeScript module loader used by pi)

### Pi extension harness detail:
- Pi loads extensions at startup via `jiti` transpiler
- Extension tools receive `ExtensionContext` with `cwd` property
- Tools run in-process (same Node.js process as pi)
- The pi process uses `node:sqlite` `DatabaseSync` (not `bun:sqlite`)
- The `sharedStore` singleton is created on first tool call and reused

## Failing Test

**File:** `test/readonly-graceful-degradation.test.ts`

The test creates a pre-populated database, makes it readonly (chmod 444), and demonstrates:

1. **Read operations work** — `findNodes()`, `getNeighbors()`, `queryRows()` all succeed on a readonly store
2. **Write operations produce the exact error** — `setFileHash()` throws "attempt to write a readonly database"
3. **`indexProject` crashes** — the LSP stage tries `deleteEdge()`/`addEdge()` which throws, and the error propagates unhandled
4. **Tool `execute()` propagates the crash** — the user gets no results, even though the data IS readable in the store

Key test: "BUG REPRODUCED: extension execute() propagates readonly crash, user gets no results"
- Pre-populates a store with graph data
- Makes the DB file readonly
- Opens a fresh store on the readonly file  
- Calls the extension's `execute()` function
- Confirms it throws instead of returning stale data

## Reproducibility

**Always** — every tool call through pi's extension runtime fails. The error is deterministic and consistent across all 5 tools.

## Design insight for fix

The read path and write path are completely separate in the graph store:
- **Reads** (all tool queries): work perfectly on a readonly database
- **Writes** (indexing pipeline): require write access

The fix should make `ensureIndexed()` catch write errors and degrade gracefully — serve stale data with a trust warning rather than crashing. The tools should never fail because the indexer can't write; they should just note that the graph may be stale.
