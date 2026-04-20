---
id: 71
type: bugfix
status: open
created: 2026-04-20T00:11:38.775Z
priority: 3
---
# No mutex around ensureIndexed: parallel tool calls race on the shared store during first-run
## Summary

`ensureIndexed` (`src/index.ts:101`) is called at the top of every tool's `execute` method. It shares a singleton `sharedStore` (`src/index.ts:63`). Nothing serializes concurrent invocations — if the pi agent fires two tool calls in the same turn (e.g. parallel `symbol_graph` + `impact`), both enter `ensureIndexed` simultaneously and both run the full pipeline against the same store.

## Problem

In steady state (DB fully indexed, git HEAD unchanged, no stale files) this is harmless because every stage becomes a no-op. But during **first-run indexing** — or whenever a source file actually changes — the two calls both hit the write path:

- Tree-sitter loop: synchronous, so it serializes within each call, but Call B will still walk all 175 files redundantly after Call A's hashes land.
- LSP stage: each call runs `runLspIndexStage` in parallel, both issuing `await client.definition(...)` to the same shared tsserver child, and both then writing edges. The `store.deleteEdge` / `store.addEdge` pair at `src/indexer/lsp.ts:79-80` can interleave between calls.
- Git stage: both read `getFileHash(GIT_HEAD_KEY)`, both think they need to recompute, both run `git log --name-only`, both write the same HEAD.

Duplicate work and a realistic window for SQLite `BUSY` errors. Combined with the unguarded-write companion issue, those errors set `lastIndexError` and contaminate the session (see stickiness companion issue).

Repro evidence in the investigation for this batch:
- Concurrent first-run `indexProject` from two separate `SqliteGraphStore` connections to the same file completes with `errors: 0` in tests — but only because tree-sitter is sync and the second call sees file-hashes already written before its own sync loop starts.
- The async LSP stage is where real interleaving happens; the investigation found persistent `lastIndexError` after initial parallel tool calls.

## Proposed fix

Gate `ensureIndexed` with a module-level promise:

```ts
let indexingInFlight: Promise<void> | null = null;

async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (indexingInFlight) return indexingInFlight;
  indexingInFlight = (async () => {
    try {
      const result = await indexProject(projectRoot, store);
      if (result.errors > 0 && !dbIsWritable(projectRoot)) {
        lastIndexError = new Error("readonly database");
      } else {
        lastIndexError = null;
      }
    } catch (err) {
      lastIndexError = err instanceof Error ? err : new Error(String(err));
    } finally {
      indexingInFlight = null;
    }
  })();
  return indexingInFlight;
}
```

Parallel tool calls now wait on the same indexing run instead of racing.

Consider also: cache the `indexProject` result for a short TTL (e.g. 5s) so rapid-fire tool calls don't each re-walk 175 files. The existing `file_hashes` skip path makes this cheap but not free (~20ms per call in the investigation timings).

## Test

- Fire `N=4` parallel `ensureIndexed` calls on an empty store
- Wrap `indexProject` so it records the number of times it was invoked
- Assert `indexProject` was called exactly once
- Assert all four callers got the resolved promise

## Impact

Medium. Touches a hot path but the change is small and well-scoped. Reduces CPU and eliminates a race class.
