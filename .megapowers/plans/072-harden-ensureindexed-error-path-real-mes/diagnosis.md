# Diagnosis — batch 072-harden-ensureindexed-error-path-real-mes

## Root Cause

There is not one root cause — this batch is a **chain of four interacting
defects** in the `ensureIndexed` error path. Each one, on its own, would not
produce the observed symptom. Together they guarantee that a transient
non-readonly failure during first-run indexing becomes a permanent "readonly
database" lie on every tool output.

The chain, ordered by data flow:

### RC-A — Unguarded writes in async indexer stages (`src/indexer/lsp.ts`, `git.ts`, `ast-grep.ts`)

`runLspIndexStage` guards only `await client.definition(...)`
(`src/indexer/lsp.ts:65-70`). The subsequent
`store.deleteEdge` / `store.addEdge` pairs at `src/indexer/lsp.ts:79-80` and
`src/indexer/lsp.ts:90-91` are **unguarded**. Any store-layer exception
(SQLITE_BUSY, readonly, schema error, our test's injected `"tsserver
crashed"`) throws straight out of the loop, up through `indexProject`
(`src/indexer/pipeline.ts:109-113`), into `ensureIndexed`'s catch.

Same pattern exists in:
- `src/indexer/git.ts:90` (`deleteEdge` in old-edge cleanup)
- `src/indexer/git.ts:135` (`addEdge` for `co_changes_with`)
- `src/indexer/git.ts:149` (`setFileHash(GIT_HEAD_KEY, head)` at the end)
- `src/indexer/ast-grep.ts:208, 209, 244` (routes/renders `addNode` / `addEdge`)

Only the tree-sitter loop (`src/indexer/pipeline.ts:72-93`) has a per-file
`try/catch` that increments `errors++` and continues. For every later stage,
a single transient write failure aborts the entire stage and the whole
`indexProject` call.

Key asymmetry in the pipeline's error accounting
(`src/indexer/pipeline.ts:63-67, 91-93, 101-104`):

```ts
let errors = 0;
...
try { /* tree-sitter per-file */ } catch { errors++; }
...
try { store.deleteFile(oldFile); removed++; } catch { errors++; }
// ↓ NO errors++ for LSP, ast-grep, coverage, git stages
await runLspIndexStage(...);   // throws → bypasses errors++, propagates
await runAstGrepIndexStage(...);
runCoverageIndexStage(...);
await runGitCoChangeStage(...);
```

This means `result.errors` only reflects tree-sitter + deletion failures.
Everything else is binary: silent success or thrown exception.

### RC-B — `ensureIndexed`'s catch conflates *any* exception with "readonly" and sets `lastIndexError` (`src/index.ts:101-113`)

```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  try {
    const result = await indexProject(projectRoot, store);
    if (result.errors > 0 && !dbIsWritable(projectRoot)) {
      lastIndexError = new Error("readonly database");
    } else {
      lastIndexError = null;
    }
  } catch (err) {
    lastIndexError = err instanceof Error ? err : new Error(String(err));
    // Indexing failed (likely readonly DB) — degrade gracefully and serve stale graph data.
  }
}
```

The comment at `src/index.ts:111` ("likely readonly DB") encoded a false
assumption — the only anticipated throw path was readonly. Because async
stages don't catch their own writes (RC-A), *any* per-edge failure reaches
this catch.

### RC-C — `indexingFailedNote()` hardcodes the string (`src/index.ts:115-118`)

```ts
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return "indexing-failed: graph may be stale (readonly database)\n";
}
```

`lastIndexError.message` is captured at `src/index.ts:110` and then
**discarded**. Every non-null error renders the same "readonly database"
string. This is the direct user-visible symptom reproduced by the failing
test. Every downstream claim that the DB is readonly is manufactured at this
line.

### RC-D — `lastIndexError` is sticky module-level state with no timestamp and no auto-clear

`src/index.ts:64`:

```ts
let lastIndexError: Error | null = null;
```

Cleared only in `ensureIndexed`'s happy path (`src/index.ts:107`). There is
no TTL, no success-counter, no hook from `finalizeReadOnlyOutput` back to
clear on observed success. Combined with RC-A (which keeps re-throwing on
every call that hits the unguarded write), the flag can re-arm itself on
every tool call and never clear until the underlying race window closes.

### RC-E — No mutex around `ensureIndexed` (`src/index.ts:101`)

`ensureIndexed` runs at the top of every tool's `execute` (`src/index.ts:152,
191, 213`). Two parallel tool calls each hit the full pipeline with the same
singleton `sharedStore` (`src/index.ts:63, 82-88`). The first-run LSP stage
does `store.deleteEdge` + `store.addEdge` as two separate statements — this
is the real-world trigger that drives RC-A in production. The pi agent
routinely fires parallel `symbol_graph` + `impact` calls; the batch's issue
history shows the symptom emerging exactly in that scenario.

## Trace

Symptom-to-root trace, following the reproduction:

1. `symbol_graph` tool output contains `indexing-failed: graph may be stale (readonly database)`.
2. That string is injected by `finalizeReadOnlyOutput` → `indexingFailedNote`
   at `src/index.ts:117`. **Symptom site.**
3. `indexingFailedNote` gates on `lastIndexError` (`src/index.ts:116`). The
   original error message is discarded — **RC-C**.
4. `lastIndexError` was set in `ensureIndexed`'s catch at `src/index.ts:110`
   with the real message ("tsserver crashed" in the test) — **RC-B**.
5. The throw came from `await indexProject(projectRoot, store)` at
   `src/index.ts:103`.
6. Inside `indexProject`, `runLspIndexStage` propagates the throw from
   `store.addEdge(...)` at `src/indexer/lsp.ts:80` because the `addEdge` call
   is not wrapped in try/catch — **RC-A**.
7. Because `lastIndexError` is module-level with no clear-on-success-read
   path (`src/index.ts:64, 101-113`), the lie sticks for the lifetime of the
   process — **RC-D**.
8. In the real (not test) scenario, parallel tool calls both enter
   `ensureIndexed` with the same store, amplifying the chance of a store
   exception at step 6 — **RC-E**.

Live evidence from the failing test (commit `9eca8f21`, `main`):

```
Received: "indexing-failed: graph may be stale (readonly database)\n## alpha (function)\nsrc/hello.ts:1:708c\n..."
```

- Real error string captured: `"tsserver crashed"` (assigned to
  `lastIndexError.message` at `src/index.ts:110`)
- Rendered in output: `"readonly database"` (manufactured at
  `src/index.ts:117`)

## Affected Code

| File | Lines | Role | RC |
|---|---|---|---|
| `src/index.ts` | 63–64 | module-level `sharedStore` + sticky `lastIndexError` | RC-D, RC-E |
| `src/index.ts` | 82–88 | `getOrCreateStore` singleton (target of parallel writes) | RC-E |
| `src/index.ts` | 101–113 | `ensureIndexed` — blanket catch, no mutex | RC-B, RC-D, RC-E |
| `src/index.ts` | 115–118 | `indexingFailedNote` — hardcoded literal | RC-C |
| `src/index.ts` | 120–130 | `finalizeReadOnlyOutput` — no clear-on-success hook | RC-D |
| `src/index.ts` | 152, 191, 213 | tool `execute` methods — each calls `ensureIndexed` without serialization | RC-E |
| `src/indexer/pipeline.ts` | 107–126 | sequential stage dispatch — no per-stage try/catch, only tree-sitter accounted for in `errors` | RC-A |
| `src/indexer/lsp.ts` | 79–80, 90–91 | unguarded `deleteEdge` + `addEdge` pairs | RC-A |
| `src/indexer/git.ts` | 90, 135, 149 | unguarded `deleteEdge` / `addEdge` / `setFileHash` | RC-A |
| `src/indexer/ast-grep.ts` | 208, 209, 244 | unguarded `addNode` / `addEdge` in routes + renders | RC-A |

Cross-reference with contract:
`test/readonly-graceful-degradation.test.ts:197-231` asserts the
"indexing-failed" note appears for a real readonly DB — this test happens to
pass today *only because* the hardcoded literal happens to match the true
cause in that one path. It does not prevent RC-C.

## Pattern Analysis

### Working reference: the tree-sitter loop (`src/indexer/pipeline.ts:70-94`)

```ts
for (const absPath of files) {
  try {
    // ... read, extract, store.addNode / addEdge / setFileHash
    indexed++;
  } catch {
    errors++;
  }
}
```

Per-file try/catch, bumps a counter, continues the loop. This is the shape
**every async stage should adopt** for per-edge writes. It survives
transient write failures without propagating, and it preserves an accurate
`result.errors` signal so the caller can distinguish
partial-success from total failure.

### Working reference: `symbol_graph`'s lazy resolver (`src/index.ts:157-167`)

```ts
const client = new TsServerClient(projectRoot);
try {
  await resolveMissingCallers(resolvedNode, store, projectRoot, client);
  ...
} catch {
  // Resolver writes failed (likely readonly DB) — continue with existing graph data.
} finally {
  await client.shutdown().catch(() => {});
}
```

Already does the right thing: guards the whole resolver block, swallows
write failures, continues. The indexer stages are missing this wrapper.

### Working reference: existing `deleteFile` loop (`src/indexer/pipeline.ts:96-104`)

```ts
for (const oldFile of store.listFiles()) {
  if (currentRel.has(oldFile) || oldFile.startsWith("__")) continue;
  try { store.deleteFile(oldFile); removed++; }
  catch { errors++; }
}
```

Same shape as tree-sitter, different operation. Confirms the project's
convention: **every per-item store mutation in a loop should be wrapped**.
The LSP / ast-grep / git stages violate this convention.

### Working reference: `TsServerClient.definition` wrapping in `runLspIndexStage`

```ts
try { loc = await client.definition(sourceNode.file, parsed.line, parsed.col); }
catch (err) { if (isStartupError(err)) return; continue; }
```

The *lookup* is guarded; the *write* that uses the lookup is not. Clear
asymmetry — an oversight, not a design choice.

### Pattern for the note itself

Current code:
```ts
return "indexing-failed: graph may be stale (readonly database)\n";
```

The only other place in the codebase that surfaces a captured error
verbatim is the resolver-wrapper comment ("(likely readonly DB)") and
`lastIndexError = err instanceof Error ? err : new Error(String(err))` —
both of which preserve the real message. `indexingFailedNote` is the single
outlier that throws the real message away.

### Assumption violations

- **RC-B** assumes "the only way `indexProject` throws is a readonly DB".
  False — async stages routinely throw on other conditions (see RC-A list).
- **RC-C** assumes "if `lastIndexError` is set, the DB is readonly". False
  for the same reason — the captured message contradicts it.
- **RC-D** assumes "the next `ensureIndexed` call will clear the state on
  success". True in theory; false in practice because RC-A + RC-E make every
  call during first-run likely to re-throw.
- **RC-E** assumes "stages are idempotent so parallel runs are safe". True
  for reads and no-op stages; false for write-heavy first-run stages.

## Hypothesis Testing

**H1: RC-C alone explains the symptom.** Tested via the failing test
(`test/ensure-indexed-error-message.test.ts`) — a forced non-readonly
throw produces the "readonly database" output even though `lastIndexError.message === "tsserver crashed"`.
**Confirmed.** Fix to `indexingFailedNote` → surface `lastIndexError.message`
verbatim closes issue #068 in isolation.

**H2: Without RC-A guards, RC-C masks real errors in production.** Checked
the call graph: `indexProject` → `runLspIndexStage` → `store.addEdge` at
`src/indexer/lsp.ts:80` has no wrapper; a real SQLITE_BUSY at that site
would reach RC-B's catch and set `lastIndexError`. Before H1's fix, it would
be re-labeled "readonly database"; after H1's fix, the real message would
surface but the *whole stage* still aborts. Guarding the per-edge writes
(H2) is independently valuable because it keeps indexing partial-success
instead of all-or-nothing. **Confirmed** by reading the stage source and
observing no try/catch around the write pair.

**H3: RC-D (stickiness) amplifies RC-A under RC-E (parallelism).** Walked
the state machine: if two parallel tool calls both enter `ensureIndexed`,
Call A throws at `addEdge`, sets `lastIndexError`. Call B may or may not
throw. Even if Call B succeeds, its happy path at `src/index.ts:107` clears
the flag — **but only after Call B's long-running `indexProject` returns**.
In the meantime, every tool call that reads `lastIndexError` via
`finalizeReadOnlyOutput` sees the stale error. Once the flag is cleared by
Call B's success, it can be re-armed by the next call's transient race.
**Confirmed** by tracing the assignment sites at `src/index.ts:105, 107, 110`.

**H4: RC-E alone can trip RC-A without any external fault.** The LSP stage
does `deleteEdge` then `addEdge` as two statements. Two parallel runs can
interleave their writes on the same `(source, target, kind, provenance_source)`
row: Call A `deleteEdge`, Call B `deleteEdge` (no-op), Call B `addEdge`
(succeeds), Call A `addEdge` (INSERT OR REPLACE — succeeds) — so in SQLite
this usually wins by last-write. But under BUSY, Call B's `addEdge` can
throw with "database is locked" depending on WAL mode and concurrent
transactions. The SQLite configuration is opened with a default
`Database(path)` call (`src/graph/sqlite.ts:9-14`) — no explicit BUSY
timeout, no WAL mode, no mutex. **Plausible, not independently reproduced
in unit tests**, but the issue history documents the organic symptom.

All four RCs are confirmed as independent contributors. The minimal fix
(RC-C only) closes #068 but leaves the system fragile; the full batch fix
addresses all four.

## Risk Assessment

### Blast radius of `ensureIndexed`

`ensureIndexed` is called from every tool's `execute`:
- `symbol_graph` (`src/index.ts:152`)
- `impact` (`src/index.ts:191`)
- `trace` (`src/index.ts:213`)

All three share `sharedStore` via `getOrCreateStore` (`src/index.ts:82-88`).

### Risks of changing `indexingFailedNote` (RC-C fix)

- **Tests:** `test/readonly-graceful-degradation.test.ts:225` asserts
  `toContain("indexing-failed")`. It does **not** assert
  `toContain("readonly database")`, so switching to `err.message` verbatim
  keeps it green — for a real readonly DB, `ensureIndexed` sets the error
  literal to `"readonly database"` at `src/index.ts:105`, so the rendered
  string would read `indexing-failed: readonly database`. The test is
  tolerant.
- **Agent-facing behavior:** Currently agents see the same string regardless
  of cause. After the fix, they see the real cause — this is the desired
  behavior.

### Risks of guarding async-stage writes (RC-A fix)

- **Silent data loss:** Swallowing write failures without accounting means
  the graph could be incomplete without signal. Mitigate by incrementing
  `errors` in the `indexer/pipeline.ts` `IndexResult` or adding a per-stage
  error counter. The companion test for #069 already demands this.
- **Order dependence:** `deleteEdge` + `addEdge` is logically atomic (replace
  an edge). If `addEdge` fails, the old edge is gone. For LSP this is fine
  — the unresolved-target edge just becomes absent until next indexing run.
  For git's bulk delete at `src/indexer/git.ts:89-91`, a mid-stream failure
  leaves the graph with fewer co_changes_with edges than it should have —
  acceptable because the next run will rebuild from scratch (gated on
  `GIT_HEAD_KEY` at `src/indexer/git.ts:83-84`).
- **`store.setFileHash(GIT_HEAD_KEY, head)` at `src/indexer/git.ts:98, 149`:**
  If the final setFileHash fails, next run repeats the full recompute.
  Acceptable.

### Risks of adding a mutex (RC-E fix)

- **Serialization latency:** Parallel tool calls now wait instead of racing.
  In steady state every stage is a no-op (skip path at
  `src/indexer/pipeline.ts:76-79`), so the wait is ~20ms. Acceptable.
- **Deadlock:** Single module-level promise, always cleared in `finally`.
  No nested awaits on the same promise. Low risk.
- **Test isolation:** `mod.resetStoreForTesting` already resets
  `sharedStore` and `lastIndexError` (`src/index.ts:74-80`). Must also
  reset the new `indexingInFlight` field.

### Risks of clear-on-success-read / timestamp (RC-D fix)

- **Over-clearing:** If a tool returns data but the underlying error is still
  valid (e.g. stale graph), clearing the flag hides a real problem. Mitigate
  by keeping the `"readonly database"` literal persistent, as proposed in
  issue #070.
- **Timestamp format:** Agents may parse `indexing-failed: <msg>` already.
  Changing to `indexing-failed (<age>s ago): <msg>` is a surface-contract
  change. Check all places that parse or match this string:
  - `test/readonly-graceful-degradation.test.ts:225` (only checks
    `indexing-failed` prefix — safe)
  - `src/output/read-only-ceremony.ts` (only matches `## Trust` — safe)
  - No other grep hits in `src/` or `test/`.

### Related bugs likely sharing root cause

- `src/indexer/lsp-resolver.ts` lazy-resolver path (called from
  `symbol_graph.execute` at `src/index.ts:159, 161`): also writes edges,
  wrapped in try/catch in the tool — already safe but worth re-auditing.
- `src/indexer/coverage.ts::runCoverageIndexStage`: called synchronously
  from `indexProject`. If it writes edges without guard, same class of bug.
  Confirm during plan.
- `src/indexer/tree-sitter.ts::extractFile`: already guarded in the
  pipeline loop — safe.

## Fixed When

1. **RC-C: `indexingFailedNote()` surfaces `lastIndexError.message`**
   verbatim (or with a prefix/age suffix) instead of the hardcoded
   "readonly database" literal. A non-readonly error string captured in
   `lastIndexError` appears in tool output exactly. Failing test
   `test/ensure-indexed-error-message.test.ts` (reproduce phase) passes.
2. **RC-A / LSP: `store.deleteEdge` + `store.addEdge` pairs in
   `runLspIndexStage`** (`src/indexer/lsp.ts:79-80, 90-91`) are wrapped in a
   shared try/catch that continues the loop on failure. A mocked store that
   throws once on `addEdge` yields `indexProject` → returns with remaining
   edges written; no exception propagates to `ensureIndexed`.
3. **RC-A / git: writes in `runGitCoChangeStage`** (`src/indexer/git.ts:90,
   135, 149`) are guarded similarly. Forced failure on any one write leaves
   the stage intact and does not trip `lastIndexError`.
4. **RC-A / ast-grep: `applyRoutesToMatches` / `applyRendersMatches` writes**
   (`src/indexer/ast-grep.ts:208, 209, 244`) are guarded similarly.
5. **RC-A / accounting: per-stage errors feed `result.errors`** (or an
   equivalent per-stage counter) in `IndexResult`, so callers retain the
   signal that indexing was partial. Existing
   `test/readonly-graceful-degradation.test.ts` remains green.
6. **RC-D / stickiness: `lastIndexError` clears on evidence of store health.**
   After a forced failure sets `lastIndexError` (non-readonly), the second
   tool invocation against a healthy store does not contain the
   "indexing-failed" note. The literal `"readonly database"` case remains
   persistent (verified-permanent).
7. **RC-D / timestamp:** `indexingFailedNote` emits an age signal (e.g.
   `indexing-failed (Ns ago): <msg>`) so agents can reason about staleness.
   Existing assertions that match `indexing-failed` prefix continue to pass.
8. **RC-E / mutex: parallel `ensureIndexed` calls share one in-flight
   indexing run.** Test: `N=4` parallel invocations on an empty store result
   in exactly one `indexProject` call and four satisfied awaiters.
9. **`resetStoreForTesting`** resets any new module-level state introduced
   by the fixes (`indexingInFlight`, timestamp fields). All existing tests
   remain green.
10. **No regressions in `bun test`** (full suite).
