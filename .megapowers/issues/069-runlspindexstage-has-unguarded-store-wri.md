---
id: 69
type: bugfix
status: done
created: 2026-04-20T00:11:38.775Z
priority: 1
---
# runLspIndexStage has unguarded store writes that contaminate the whole session
## Summary

`runLspIndexStage` in `src/indexer/lsp.ts:38-93` catches errors around the async `client.definition()` call but leaves the subsequent `store.deleteEdge` / `store.addEdge` calls **unguarded**.

```ts
// src/indexer/lsp.ts:65-70  — guarded
try {
  loc = await client.definition(sourceNode.file, parsed.line, parsed.col);
} catch (err) {
  if (isStartupError(err)) return;
  continue;
}

// src/indexer/lsp.ts:79-80, 90-91  — NOT guarded
store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
store.addEdge(makeLspEdge(...));
```

## Problem

Any transient SQLite failure (`SQLITE_BUSY`, `SQLITE_LOCKED`, readonly DB, etc.) from these writes throws straight out of `runLspIndexStage`, up through `indexProject`, into `ensureIndexed`'s catch block (`src/index.ts:109`), where it populates `lastIndexError`. Combined with the stickiness of that variable (see companion issue), a single edge-write hiccup contaminates every subsequent tool output in the process.

This is especially dangerous because `ensureIndexed` runs **on every tool call**, and the most common time these writes happen is during first-run indexing when two tool calls can race.

## Repro (observed)

Initial parallel `symbol_graph` calls during this session produced the "indexing-failed" note across every tool output for the rest of the turn. DB was writable (`-rw-r--r--`, owner matches, `accessSync(W_OK)` passes), `indexProject` in isolation returned `errors: 0`, and `bun test` passed all 366 tests. The only plausible path for the persistent error is an unguarded write in a later pipeline stage during first-run race.

## Proposed fix

Wrap each `deleteEdge`/`addEdge` pair in a try/catch that logs-and-continues rather than aborting the entire stage:

```ts
try {
  store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
  store.addEdge(makeLspEdge(edge.source, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
} catch {
  // transient write failure — skip this edge, continue stage
  continue;
}
```

Same pattern for the confirmed-edge branch at lines 90-91.

Apply the same audit to `runGitCoChangeStage` (`src/indexer/git.ts:90, 135, 149`) and `runAstGrepIndexStage` → `applyRoutesToMatches` / `applyRendersMatches` (`src/indexer/ast-grep.ts:208, 209, 244`), which have the same unguarded-write pattern.

## Test

Add a test that:
1. Opens a writable `SqliteGraphStore`
2. Injects a mock that forces the 2nd `addEdge` in `runLspIndexStage` to throw once
3. Asserts `indexProject` completes with `errors: 0` (or a per-stage error counter bumped by 1) rather than propagating
4. Asserts subsequent edges in the same stage were still written

## Impact

Medium. Touches three indexer stages. Makes indexing robust to transient per-edge write failures instead of aborting globally.
