---
id: 68
type: bugfix
status: open
created: 2026-04-20T00:11:38.775Z
priority: 2
---
# indexingFailedNote always reports "readonly database" regardless of actual cause
## Summary

`indexingFailedNote()` in `src/index.ts:115-118` returns a **hardcoded** string whenever `lastIndexError` is non-null, no matter what the underlying error actually was.

```ts
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return "indexing-failed: graph may be stale (readonly database)\n";
}
```

## Problem

`lastIndexError` can be set for several non-readonly reasons:
- `indexProject` throws (caught at `src/index.ts:109-112`) — the message is captured into `lastIndexError.message` but then discarded by the hardcoded string
- Transient SQLite `BUSY`/`LOCKED` during concurrent tool calls
- `Bun.YAML.parse` missing (thrown from `src/indexer/ast-grep.ts:66`)
- tsserver startup failures that aren't caught as `isStartupError`
- Any unguarded `store.addEdge` / `deleteEdge` call in a later pipeline stage

In all of these cases the tool output lies, telling the agent to check file permissions when the real issue is completely different.

## Repro

Observed during this session: first batch of parallel `symbol_graph` calls on a fresh `.codegraph/graph.db` produced the "readonly database" note, even though `ls -le .codegraph/graph.db` showed `-rw-r--r--`, `accessSync(path, W_OK)` succeeded, `sqlite3 PRAGMA integrity_check` returned `ok`, and manual `indexProject` runs completed with `errors: 0`. The DB was demonstrably writable.

## Proposed fix

Surface the actual error message. Distinguish the "`result.errors > 0 && !dbIsWritable()`" path (genuine readonly) from the caught-exception path:

```ts
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return `indexing-failed: ${lastIndexError.message}\n`;
}
```

Keep the explicit "readonly database" literal only where `ensureIndexed` has actually proven the DB is unwritable:

```ts
if (result.errors > 0 && !dbIsWritable(projectRoot)) {
  lastIndexError = new Error("readonly database");
}
```

That line already produces the exact message — letting `indexingFailedNote` print `err.message` verbatim keeps the existing behavior for real readonly DBs *and* gives real errors for everything else.

## Test

`test/readonly-graceful-degradation.test.ts:197` already covers the readonly case. Add a test where `indexProject` throws a non-readonly error (e.g. mock `runLspIndexStage` to throw `new Error("tsserver crashed")`) and assert the tool output contains `indexing-failed: tsserver crashed` rather than `readonly database`.

## Impact

Low risk. Single-function change. Improves debuggability for every future indexing failure without altering the happy path.
