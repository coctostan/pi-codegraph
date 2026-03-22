# Diagnosis

## Root Cause

**`ensureIndexed()` is a mandatory write gate with no error handling, blocking all tool reads.**

Every tool's `execute()` calls `ensureIndexed()` (line 82 of `src/index.ts`) which unconditionally calls `indexProject()` — a full 5-stage write pipeline. When the database is readonly (as it is under pi's extension runtime), write operations throw `"attempt to write a readonly database"`. The error propagates unhandled through 3 layers and kills the tool call entirely, even though every read operation (the actual tool query) works perfectly on the readonly database.

This is not a missing try/catch — it's a **structural design flaw**: the write path (indexing) and read path (tool queries) are mandatory-coupled with no degradation mechanism. The code was written assuming write access is always available, which is true under `bun test` but not under pi's Node.js extension runtime.

## Trace

```
User calls symbol_graph({ name: "GraphStore" })
  → src/index.ts:107   const store = getOrCreateStore(projectRoot)  // OK — constructor succeeds on existing DB
  → src/index.ts:108   await ensureIndexed(projectRoot, store)
    → src/index.ts:82   await indexProject(projectRoot, store)
      → src/indexer/pipeline.ts:73-97   tree-sitter stage
        ↳ store.deleteFile(), addNode(), addEdge(), setFileHash()
        ↳ try/catch PER FILE → errors++ (SWALLOWED — readonly errors silently counted)
      → src/indexer/pipeline.ts:108-114  LSP stage
        → src/indexer/lsp.ts:79  store.deleteEdge(...)  ← THROWS: "attempt to write a readonly database"
        ↳ try/FINALLY (no catch!) — error PROPAGATES
      ← throw propagates back through indexProject → ensureIndexed → execute
  → pi runtime receives error instead of tool result
  → User sees: "attempt to write a readonly database"
```

## Affected Code

### Primary: the mandatory write-before-read gate
| File | Lines | Issue |
|------|-------|-------|
| `src/index.ts` | 82-84 | `ensureIndexed()` — bare passthrough to `indexProject()`, no error handling |
| `src/index.ts` | 107-108, 136-137, 157-158, 175-176, 198-199 | All 5 tools call `ensureIndexed()` before any read |

### Secondary: unguarded write operations in pipeline stages
| File | Lines | Unguarded writes |
|------|-------|-----------------|
| `src/indexer/lsp.ts` | 79-80, 90-91 | `deleteEdge()`, `addEdge()` — **first throw point** |
| `src/indexer/ast-grep.ts` | 208-209, 244 | `addNode()`, `addEdge()` |
| `src/indexer/coverage.ts` | 169, 194 | `addEdge()`, `saveTestTrace()` |
| `src/indexer/git.ts` | 90, 98, 135, 149 | `deleteEdge()`, `addEdge()`, `setFileHash()` |

### Tertiary: additional write paths in tool-level code
| File | Lines | Unguarded writes |
|------|-------|-----------------|
| `src/indexer/lsp-resolver.ts` | 112, 121-130, 145-155, 171-180 | `addNode()`, `addEdge()` in `resolveMissingCallers()` and `resolveImplementations()` — called by `symbol_graph` tool AFTER `ensureIndexed` |
| `src/tools/resolve-edge.ts` | 79 | `store.addEdge()` — `resolve_edge` is write-by-design |
| `src/graph/sqlite.ts` | 95-96, 99-100 | `initSchema()`: conditional INSERT and ALTER TABLE in constructor — would fail on brand-new readonly DB |

## Pattern Analysis

### Working pattern (tree-sitter stage):
```typescript
// pipeline.ts lines 73-97
for (const absPath of files) {
  try {
    // ... reads and writes ...
    store.deleteFile(rel);    // write
    store.addNode(node);      // write  
    store.setFileHash(rel, hash); // write
  } catch {
    errors++;  // ← CATCHES and CONTINUES
  }
}
```

### Broken pattern (LSP stage, ast-grep, coverage, git):
```typescript
// pipeline.ts lines 108-114
try {
  await runLspIndexStage(store, projectRoot, client);
} finally {
  await client.shutdown().catch(() => {});  // ← finally, NOT catch!
}
// Inside runLspIndexStage — NO error handling:
store.deleteEdge(...);  // THROWS on readonly
store.addEdge(...);     // never reached
```

### Broken pattern (tool-level — ensureIndexed):
```typescript
// index.ts line 82 — every tool does this:
async function ensureIndexed(projectRoot, store) {
  await indexProject(projectRoot, store);
  // ← no catch, no fallback, no degradation
}
```

### Key difference:
The tree-sitter stage treats write failures as **non-fatal** (count and continue). Every other stage and the top-level `ensureIndexed` treats them as **fatal** (crash the entire tool).

## Risk Assessment

### What depends on the affected code:
- All 5 tools (`symbol_graph`, `resolve_edge`, `impact`, `trace`, `graph_query`) — currently 100% broken under pi runtime
- The `sharedStore` singleton in `src/index.ts` — once created, it persists across all tool calls in a session

### What could break if changed:
1. **If `ensureIndexed` catches and swallows errors**: tools serve stale data without the user knowing. Must add staleness indicator to output.
2. **If indexer stages get error handling**: write errors in one stage could leave the graph in a partially-updated state. Need to consider transaction boundaries or accept eventual consistency.
3. **`resolve_edge` is write-by-design**: this tool fundamentally cannot work on a readonly DB. Must fail gracefully with a clear message, not crash.
4. **`symbol_graph`'s `resolveMissingCallers`/`resolveImplementations`**: these are lazy write-on-read operations. Need the same readonly-safe treatment.
5. **`initSchema()` in constructor**: on a brand-new project with readonly constraints, even opening the store would fail (INSERT into schema_version).

### Related concerns:
- The `IndexResult.errors` field already counts tree-sitter write failures silently — callers never check this value
- There is no mechanism to communicate "graph is stale" to tool output — the trust/freshness header exists but only checks file hash staleness, not whether indexing succeeded

## Fixed When

1. All 5 read-oriented tools (`symbol_graph`, `impact`, `trace`, `graph_query`, and read path of `resolve_edge`) return results from existing graph data when the DB is readonly, instead of crashing
2. `ensureIndexed()` catches indexing write failures and degrades gracefully (skip indexing, serve stale data)
3. Each pipeline stage (`lsp`, `ast-grep`, `coverage`, `git`) handles write failures without crashing `indexProject`
4. `resolve_edge` returns a clear error message when the DB is readonly (it needs write access by design)
5. `symbol_graph`'s lazy resolver (`resolveMissingCallers`/`resolveImplementations`) handles write failures without crashing
6. Tool output indicates when the graph is stale due to failed indexing (trust header shows degraded state)
7. Existing test suite (231 tests) continues to pass
8. Failing test `test/readonly-graceful-degradation.test.ts` passes with the fix
