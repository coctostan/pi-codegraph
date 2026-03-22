# Bugfix Summary: Tools crash with "attempt to write a readonly database"

## Issue
All 5 codegraph tools (`symbol_graph`, `resolve_edge`, `impact`, `trace`, `graph_query`) crashed with `"attempt to write a readonly database"` when running under pi's extension runtime, which opens the SQLite database in readonly mode.

## Root Cause
`ensureIndexed()` unconditionally called `indexProject()` — a full 5-stage write pipeline — before every tool invocation. When the database was readonly, write operations in the LSP indexing stage threw an unhandled error that propagated up and killed the entire tool call. The read operations (the actual tool queries) worked perfectly on the readonly database, but could never be reached because the write gate crashed first.

Three separate write paths were unprotected:
1. **`ensureIndexed()`** — top-level indexing pipeline (all tools)
2. **`resolveMissingCallers`/`resolveImplementations`** — lazy write-on-read in `symbol_graph`
3. **`resolveEdge()`** — write-by-design in `resolve_edge`

## Fix Approach
Graceful degradation at the tool layer in `src/index.ts`:

1. **`ensureIndexed()`** wrapped in try/catch — catches any indexing failure, records the error, and allows tools to proceed with stale graph data
2. **Lazy resolver** (`resolveMissingCallers`/`resolveImplementations`) wrapped in try/catch — continues with existing graph data on write failure
3. **`resolve_edge`** wrapped in try/catch — returns a clear error message ("database is readonly") instead of crashing
4. **`indexingFailedNote()`** helper — prepends `"indexing-failed: graph may be stale (readonly database)"` to all read-tool outputs when indexing failed, so agents know the data may be stale

## Files Changed
| File | Change |
|------|--------|
| `src/index.ts` | Core fix: `ensureIndexed` try/catch, `indexingFailedNote()` helper, lazy resolver catch, `resolve_edge` catch |
| `test/readonly-graceful-degradation.test.ts` | Removed 2 bug-repro tests, added 4 fix-verification tests |

## How to Verify
```bash
bun test test/readonly-graceful-degradation.test.ts
# 8 pass, 0 fail

bun test
# 233 pass, 0 fail
```

The test file exercises all three fix paths: ensureIndexed catching errors, lazy resolver surviving readonly writes, resolve_edge returning a message, and trust header showing indexing-failed status.
