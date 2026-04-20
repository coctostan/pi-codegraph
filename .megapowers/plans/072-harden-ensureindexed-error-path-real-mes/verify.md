# Verification Report — 072-harden-ensureindexed-error-path-real-mes

## Test Suite Results

```
bun test — 376 pass, 0 fail
Ran 376 tests across 153 files. [10.51s]
```

Full suite run fresh this session. All pass.

---

## Per-Criterion Verification

### Criterion 1: RC-C — `indexingFailedNote()` surfaces `lastIndexError.message` verbatim

**Command:** `bun test test/ensure-indexed-error-message.test.ts`

**Evidence:**
```
(pass) batch 072: indexingFailedNote surfaces the real error message >
  non-readonly indexing failure is reported verbatim in tool output [111.13ms]
```

Source (`src/index.ts:143-145`):
```ts
function indexingFailedNote(): string {
  return getIndexingFailedNoteForTesting();
}
```

Source (`src/index.ts:84-88`):
```ts
export function getIndexingFailedNoteForTesting(now: number = Date.now()): string {
  if (!lastIndexError) return "";
  const ageSeconds = Math.max(0, Math.floor((now - lastIndexError.setAt) / 1000));
  return `indexing-failed (${ageSeconds}s ago): ${lastIndexError.error.message}\n`;
}
```

Test forces a non-readonly error ("tsserver crashed" via `listFiles` monkey-patch), then asserts:
- `expect(sgText).toContain("tsserver crashed")` ✅
- `expect(sgText).not.toContain("readonly database")` ✅
- `expect(sgText).toContain("alpha")` ✅

**Verdict:** ✅ pass

---

### Criterion 2: RC-A/LSP — `store.deleteEdge` + `store.addEdge` pairs in `runLspIndexStage` are wrapped

**Command:** `bun test test/lsp-stage-guarded-writes.test.ts`

**Evidence:**
```
(pass) RC-A/LSP: unresolved-branch writes are guarded > one addEdge throw does not abort the stage; remaining edges still written [11.39ms]
(pass) RC-A/LSP: unresolved-branch writes are guarded > confirmed-branch: one addEdge throw does not abort the stage [8.37ms]
```

Source (`src/indexer/lsp.ts:74-91`):
```ts
// unresolved branch
try {
  store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
  store.addEdge(makeLspEdge(...));
} catch {
  errors++;
}
// confirmed branch
try {
  store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
  store.addEdge(makeLspEdge(...));
} catch {
  errors++;
}
```

Both branches verified by distinct test cases. First `addEdge` throws → second succeeds; stage completes without propagating; `expect(lspCalls).toBe(2)` ✅.

**Verdict:** ✅ pass

---

### Criterion 3: RC-A/git — writes in `runGitCoChangeStage` are guarded

**Command:** `bun test test/git-stage-guarded-writes.test.ts`

**Evidence:**
```
(pass) RC-A/git: runGitCoChangeStage writes are guarded > addEdge throw during co-change write does not abort the stage [123.57ms]
```

Source (`src/indexer/git.ts:88-93, 131-146, 149-153`):
- `deleteEdge` in old-edge cleanup: `try { store.deleteEdge(...) } catch { errors++; }`
- `addEdge` for co_changes_with: `try { store.addEdge({...}) } catch { errors++; }`
- `setFileHash(GIT_HEAD_KEY, head)`: `try { store.setFileHash(...) } catch { errors++; }`

Test forces first `co_changes_with` addEdge to throw; `expect(coChangeCalls).toBe(3)` ✅; `expect(coEdges.length).toBeGreaterThanOrEqual(2)` ✅.

**Verdict:** ✅ pass

---

### Criterion 4: RC-A/ast-grep — `applyRoutesToMatches` / `applyRendersMatches` writes are guarded

**Command:** `bun test test/ast-grep-guarded-writes.test.ts`

**Evidence:**
```
(pass) RC-A/ast-grep: applyRuleMatches writes are guarded > routes_to: addNode throw does not abort the stage [7.35ms]
(pass) RC-A/ast-grep: applyRuleMatches writes are guarded > renders: addEdge throw does not abort the stage [8.17ms]
```

Source (`src/indexer/ast-grep.ts:208-224`):
```ts
try {
  store.addNode(endpointNode);
  store.addEdge({...routes_to...});
} catch {
  errors++;
}
```

Source (`src/indexer/ast-grep.ts:250-265`):
```ts
try {
  store.addEdge({...renders...});
} catch {
  errors++;
}
```

`routes_to` test: first `addNode(endpoint)` throws → second match persists → `expect(endpointNodeWrites).toBe(2)` ✅, `expect(edges.length).toBe(1)` ✅  
`renders` test: first `addEdge(renders)` throws → second succeeds → `expect(renderWrites).toBe(2)` ✅

**Verdict:** ✅ pass

---

### Criterion 5: RC-A/accounting — per-stage errors feed `result.errors`

**Command:** `bun test test/pipeline-stage-error-accounting.test.ts`

**Evidence:**
```
(pass) RC-A accounting: stage write failures bump result.errors > LSP stage write failure increments errors, does not abort pipeline [63.24ms]
```

Source (`src/indexer/pipeline.ts:109-122`):
```ts
errors += await runLspIndexStage(store, projectRoot, client);  // line 110
errors += await runAstGrepIndexStage(store, projectRoot, changedFiles);  // line 116
errors += await runGitCoChangeStage(store, projectRoot);  // line 122
```

Test forces all LSP `addEdge` calls to throw; `expect(lspWrites).toBeGreaterThanOrEqual(1)` ✅; `expect(result.errors).toBeGreaterThanOrEqual(lspWrites)` ✅. `result` is defined (pipeline did not abort) ✅.

**Verdict:** ✅ pass

---

### Criterion 6: RC-D/stickiness — `lastIndexError` clears on evidence of store health; `"readonly database"` stays persistent

**Command:** `bun test test/last-index-error-clear-on-health.test.ts`

**Evidence:**
```
(pass) RC-D: lastIndexError clears on store-health evidence > finalizeReadOnlyOutput clears transient lastIndexError but preserves 'readonly database' [262.12ms]
```

Source (`src/index.ts:163-169`):
```ts
if (
  lastIndexError &&
  lastIndexError.error.message !== "readonly database" &&
  withoutFreshHeader.trim().length > 0
) {
  lastIndexError = null;
}
```

Phase 1 of test (transient error):
- `expect(t1).toContain("indexing-failed")` ✅
- `expect(t1).toContain("transient scan failure")` ✅
- `expect(mod.getLastIndexErrorForTesting()).toBeNull()` ✅ — cleared after first call

Phase 2 (verified readonly):
- `expect(t2).toContain("readonly database")` ✅
- `expect(mod.getLastIndexErrorForTesting()?.message).toBe("readonly database")` ✅ — preserved

**Verdict:** ✅ pass

---

### Criterion 7: RC-D/timestamp — `indexingFailedNote` emits an age signal `(Ns ago)`

**Command:** `bun test test/indexing-failed-note-age.test.ts`

**Evidence:**
```
(pass) RC-D: indexingFailedNote includes an age > helper renders 'indexing-failed (<N>s ago): <msg>' and preserves the prefix [0.11ms]
```

Test:
```ts
mod.setLastIndexErrorForTesting(new Error("transient scan failure"), 1_000);
const note = mod.getIndexingFailedNoteForTesting(4_500);
expect(note).toBe("indexing-failed (3s ago): transient scan failure\n");
expect(note).toContain("indexing-failed");
```
Both assertions pass ✅.

Backward compatibility: `readonly-graceful-degradation.test.ts:225` only asserts `toContain("indexing-failed")` prefix — still passes ✅ (confirmed by full suite run).

**Verdict:** ✅ pass

---

### Criterion 8: RC-E/mutex — parallel `ensureIndexed` calls share one in-flight indexing run

**Command:** `bun test test/ensure-indexed-mutex.test.ts`

**Evidence:**
```
(pass) RC-E: ensureIndexed coalesces parallel calls > N=4 parallel tool invocations run indexProject exactly once, and resetStoreForTesting restores the override + in-flight state [27.46ms]
```

Source (`src/index.ts:123-141`):
```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (indexingInFlight) return indexingInFlight;
  indexingInFlight = (async () => {
    try { ... } catch { ... } finally { indexingInFlight = null; }
  })();
  return indexingInFlight;
}
```

Test fires 4 parallel tool calls; all await the same in-flight promise; `expect(indexCallCount).toBe(1)` ✅; all 4 results defined ✅.

**Verdict:** ✅ pass

---

### Criterion 9: `resetStoreForTesting` resets new module-level state

**Evidence from source** (`src/index.ts:94-102`):
```ts
export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
  lastIndexError = null;    // clears IndexErrorRecord
  indexingInFlight = null;  // clears new mutex promise
  indexProjectImpl = indexProject;  // restores real impl
  resetSession();
  _resetSearchCache();
}
```

Also verified by test `ensure-indexed-mutex.test.ts` (second phase): after `resetStoreForTesting()`, a fresh override is installed and a new tool call invokes it exactly once — proving both `indexProjectImpl` was restored and `indexingInFlight` was cleared. `expect(secondCallCount).toBe(1)` ✅.

Token-tracker session reset also included via `resetSession()` (verified by `test/token-tracker-session-reset.test.ts` — passes).

**Verdict:** ✅ pass

---

### Criterion 10: No regressions in `bun test` (full suite)

**Command:** `bun test` (full suite, run fresh at the start of this session)

**Evidence:**
```
376 pass
0 fail
1095 expect() calls
Ran 376 tests across 153 files. [10.51s]
```

`readonly-graceful-degradation.test.ts` specifically re-run and confirmed:
```
6 pass, 0 fail
```

**Verdict:** ✅ pass

---

## Bug Reproduction — Step 1b

The original symptom: tool output contains `indexing-failed: graph may be stale (readonly database)` even when the DB is writable and the actual error is e.g. `"tsserver crashed"`.

Test `test/ensure-indexed-error-message.test.ts` explicitly reproduces this:
- Forces non-readonly error via `SqliteGraphStore.prototype.listFiles` monkey-patch
- **Before fix:** output would contain `"readonly database"` (hardcoded)
- **After fix:** `expect(sgText).toContain("tsserver crashed")` ✅ and `expect(sgText).not.toContain("readonly database")` ✅

The test passes — symptom is gone.

---

## Overall Verdict

**pass**

All 10 acceptance criteria are independently verified with fresh command output from this session. The implementation correctly addresses all four root causes:

- **RC-C:** `indexingFailedNote` now delegates to `getIndexingFailedNoteForTesting()` which surfaces `lastIndexError.error.message` verbatim with an age suffix
- **RC-A:** All three indexer stages (LSP, git, ast-grep) now wrap per-edge writes in `try/catch { errors++ }` — write failures continue the loop rather than aborting the stage; errors propagate back to `result.errors`
- **RC-D:** `lastIndexError` changed to `IndexErrorRecord { error, setAt }` with timestamp; `finalizeReadOnlyOutput` clears transient errors (non-readonly) after building the note; `"readonly database"` literal remains persistent
- **RC-E:** `ensureIndexed` uses an `indexingInFlight` promise mutex — N=4 parallel calls produce exactly one `indexProject` invocation; `resetStoreForTesting` clears the new state fields
