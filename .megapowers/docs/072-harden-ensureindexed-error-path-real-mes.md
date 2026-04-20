# Bugfix Summary — 072: Harden ensureIndexed Error Path

**Issues closed:** #068, #069, #070, #071  
**Branch:** `fix/072-harden-ensureindexed-error-path-real-mes`  
**Test count added:** 10 new tests across 8 new test files

---

## Problem

Parallel `symbol_graph` calls during first-run indexing produced a permanent
`indexing-failed: graph may be stale (readonly database)` note on every tool
output — even when the database was demonstrably writable. The symptom was a
chain of four interacting defects in the `ensureIndexed` error path.

### Root Causes

**RC-A — Unguarded writes in async indexer stages**

`runLspIndexStage`, `runGitCoChangeStage`, and `applyRuleMatches` (ast-grep)
each contained write pairs (`store.deleteEdge` + `store.addEdge`) with no
per-item try/catch. A single transient SQLite `BUSY` or any other write
failure propagated straight out of the stage, through `indexProject`, and
into `ensureIndexed`'s catch block — aborting the entire pipeline.

Only the tree-sitter loop had the correct pattern: per-item `try/catch {
errors++; continue; }`.

**RC-C — `indexingFailedNote()` hardcoded "readonly database"**

```ts
// Before
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return "indexing-failed: graph may be stale (readonly database)\n";  // always wrong
}
```

`lastIndexError.message` was captured (via RC-A's throw path) but then
**discarded**. Every non-readonly error produced the same misleading string,
even `"tsserver crashed"`.

**RC-D — `lastIndexError` was sticky with no timestamp and no auto-clear**

The module-level `lastIndexError: Error | null` had no TTL and was only
cleared when a full `ensureIndexed` cycle completed without throwing. Under
RC-A + RC-E conditions, it re-armed itself on every tool call and never
cleared during the first-run window.

**RC-E — No mutex around `ensureIndexed`**

All three tools (`symbol_graph`, `impact`, `trace`) called `ensureIndexed`
on entry with the same singleton `sharedStore`. Parallel tool calls ran the
full indexing pipeline concurrently — duplicating work and creating a
realistic write-race window that triggered RC-A.

---

## Fix

### RC-C fix — `indexingFailedNote` surfaces real error message with age

`indexingFailedNote` now delegates to a shared formatter that embeds the
real `lastIndexError.error.message` and an age-in-seconds:

```ts
// src/index.ts
export function getIndexingFailedNoteForTesting(now: number = Date.now()): string {
  if (!lastIndexError) return "";
  const ageSeconds = Math.max(0, Math.floor((now - lastIndexError.setAt) / 1000));
  return `indexing-failed (${ageSeconds}s ago): ${lastIndexError.error.message}\n`;
}

function indexingFailedNote(): string {
  return getIndexingFailedNoteForTesting();
}
```

### RC-A fix — Per-edge write guards in all three async stages

Every `store.deleteEdge` / `store.addEdge` / `store.addNode` mutation in a
loop is now wrapped in `try { ... } catch { errors++; }`. Write failures
skip the current item and continue the loop rather than aborting the stage.
Each stage now returns an `errors: number` count.

```ts
// Pattern applied across lsp.ts, git.ts, ast-grep.ts
try {
  store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
  store.addEdge(makeLspEdge(...));
} catch {
  errors++;
}
```

The pipeline accumulates all stage error counts into `IndexResult.errors`:

```ts
// src/indexer/pipeline.ts
errors += await runLspIndexStage(store, projectRoot, client);
errors += await runAstGrepIndexStage(store, projectRoot, changedFiles);
errors += await runGitCoChangeStage(store, projectRoot);
```

### RC-D fix — Timestamp + clear-on-health-evidence

`lastIndexError` is now an `IndexErrorRecord { error: Error; setAt: number }`.
`finalizeReadOnlyOutput` clears transient (non-readonly) errors after
building the current call's note — so this call shows the real error message,
and the next call starts clean:

```ts
// src/index.ts — finalizeReadOnlyOutput
if (
  lastIndexError &&
  lastIndexError.error.message !== "readonly database" &&
  withoutFreshHeader.trim().length > 0
) {
  lastIndexError = null;
}
```

The `"readonly database"` literal (set by the `result.errors > 0 &&
!dbIsWritable()` branch) is explicitly preserved as a permanent signal.

### RC-E fix — `indexingInFlight` promise mutex

`ensureIndexed` now coalesces parallel calls onto a single in-flight promise:

```ts
// src/index.ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (indexingInFlight) return indexingInFlight;
  indexingInFlight = (async () => {
    try { ... } catch { ... } finally { indexingInFlight = null; }
  })();
  return indexingInFlight;
}
```

N=4 parallel tool invocations now produce exactly one `indexProject` call.

---

## Files Changed

| File | Change |
|------|--------|
| `src/index.ts` | RC-C: real error message + age in note; RC-D: `IndexErrorRecord` type + timestamp + clear-on-health; RC-E: `indexingInFlight` mutex + `indexProjectImpl` override hook; `resetStoreForTesting` clears all new state |
| `src/indexer/lsp.ts` | RC-A: wrap unresolved-branch and confirmed-branch write pairs; return `errors: number` |
| `src/indexer/git.ts` | RC-A: wrap `deleteEdge`, `addEdge`, and `setFileHash` in old-edge and co-change loops; return `errors: number` |
| `src/indexer/ast-grep.ts` | RC-A: wrap `addNode`+`addEdge` in `applyRoutesToMatches`; wrap `addEdge` in `applyRendersMatches`; propagate error counts |
| `src/indexer/pipeline.ts` | RC-A accounting: `errors +=` for LSP, ast-grep, and git stage returns |

**New test files (10 tests):**

| Test File | Covers |
|-----------|--------|
| `test/ensure-indexed-error-message.test.ts` | RC-C: real error message in tool output; never "readonly database" for non-readonly failure |
| `test/lsp-stage-guarded-writes.test.ts` | RC-A/LSP: unresolved-branch and confirmed-branch write guards |
| `test/git-stage-guarded-writes.test.ts` | RC-A/git: co-change write guards |
| `test/ast-grep-guarded-writes.test.ts` | RC-A/ast-grep: `routes_to` addNode and `renders` addEdge guards |
| `test/pipeline-stage-error-accounting.test.ts` | RC-A accounting: LSP write failures increment `result.errors` |
| `test/last-index-error-clear-on-health.test.ts` | RC-D: transient error clears after first successful output; "readonly database" persists |
| `test/indexing-failed-note-age.test.ts` | RC-D: age signal in note format `(Ns ago)` |
| `test/ensure-indexed-mutex.test.ts` | RC-E: N=4 parallel calls → exactly 1 `indexProject` invocation; `resetStoreForTesting` clears new state |

---

## How to Verify

```bash
# Targeted: all new RC criteria
bun test test/ensure-indexed-error-message.test.ts \
         test/lsp-stage-guarded-writes.test.ts \
         test/git-stage-guarded-writes.test.ts \
         test/ast-grep-guarded-writes.test.ts \
         test/pipeline-stage-error-accounting.test.ts \
         test/last-index-error-clear-on-health.test.ts \
         test/indexing-failed-note-age.test.ts \
         test/ensure-indexed-mutex.test.ts

# Full suite (no regressions)
bun test
```

Expected: 376 pass, 0 fail.

The original symptom is reproducible via `test/ensure-indexed-error-message.test.ts`:
a `listFiles` monkey-patch forces `"tsserver crashed"` into `ensureIndexed`'s catch.
After the fix: output contains `"tsserver crashed"` and never `"readonly database"`.
