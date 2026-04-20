## Task 1: RC-C: indexingFailedNote surfaces lastIndexError.message verbatim

The current red test source is unstable across the batch. It throws from `SqliteGraphStore.prototype.addEdge` in the LSP stage, but Tasks 2–3 are supposed to guard those writes in `src/indexer/lsp.ts:74-91`, which would make this regression disappear and force Task 2 to rewrite Task 1's test.

Use a non-LSP throw path that still reaches `ensureIndexed()` after the full batch. The simplest one is `store.listFiles()`, which is called outside any per-item guard in `src/indexer/pipeline.ts:96` and `src/indexer/lsp.ts:46`.

Replace the test setup in `test/ensure-indexed-error-message.test.ts` from the current addEdge/definition monkey-patch shape to this shape:

```ts
const originalListFiles = SqliteGraphStore.prototype.listFiles;
SqliteGraphStore.prototype.listFiles = function () {
  throw new Error("tsserver crashed");
};
```

Then restore `listFiles` in the `finally` block instead of restoring `TsServerClient.prototype.definition` / `SqliteGraphStore.prototype.addEdge`.

This still drives the same product change in `src/index.ts`:

```ts
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return `indexing-failed: ${lastIndexError.message}\n`;
}
```

but it keeps AC #1 valid after Tasks 2–5 land.

## Task 2: RC-A/LSP: guard unresolved-branch write pair in runLspIndexStage

Two issues here:

1. The test data does not actually trigger `client.definition(...)` with the lines your fake client expects. `runLspIndexStage()` parses `edge.provenance.evidence` and calls `client.definition(sourceNode.file, parsed.line, parsed.col)` at `src/indexer/lsp.ts:61-67`. Your test uses:

```ts
provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetA:10:1", content_hash: "h" }
```

but the fake client branches on `line === 2` / `line === 5`. That means `loc` is `null`, no LSP write happens, and Step 2's expected `SQLITE_BUSY` failure cannot occur.

Use call-site line numbers in the evidence string, matching `callEvidence()` in `src/indexer/tree-sitter.ts:424-425`:

```ts
const unresolvedA: GraphEdge = {
  // ...
  provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetA:2:1", content_hash: "h" },
};
const unresolvedB: GraphEdge = {
  // ...
  provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetB:5:1", content_hash: "h" },
};
```

2. Remove the Step 5 instruction that edits `test/ensure-indexed-error-message.test.ts`. That makes this task touch two test files and changes Task 1's contract. After revising Task 1 as above, Task 2 should stay scoped to:
- `src/indexer/lsp.ts`
- `test/lsp-stage-guarded-writes.test.ts`

Update the task frontmatter/files list to match that scope exactly.

## Task 3: RC-A/LSP: guard confirmed-branch write pair in runLspIndexStage

This task has the same evidence/line mismatch as Task 2. `runLspIndexStage()` calls `client.definition()` with the line from `edge.provenance.evidence`, but the test data uses `"targetA:10:1"` / `"targetB:20:1"` while the fake client branches on `2` / `5`.

Change the evidence strings to call-site lines:

```ts
const resolvedA: GraphEdge = {
  // ...
  provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetA:2:1", content_hash: "h" },
};
const resolvedB: GraphEdge = {
  // ...
  provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetB:5:1", content_hash: "h" },
};
```

Keep the fake client returning resolved locations `10` / `20`, so the confirmed-branch check still passes:

```ts
if (line === 2) return { file: "src/y.ts", line: 10, col: 1 };
if (line === 5) return { file: "src/y.ts", line: 20, col: 1 };
```

Without that fix, Step 2's expected throw at `src/indexer/lsp.ts:91` is not reachable.

## Task 5: RC-A/ast-grep: guard writes in applyRoutesToMatches and applyRendersMatches

Your route-rule fixture uses the wrong template syntax for the real `renderTemplate()` API. `src/indexer/ast-grep.ts:178-185` replaces `{METHOD}` / `{PATH}`, and the bundled rule uses `endpoint:{METHOD}:{PATH}` in `src/rules/express.yaml:7`.

Replace:

```ts
to_template: "endpoint::${METHOD}::${PATH}",
```

with:

```ts
to_template: "endpoint:{METHOD}:{PATH}",
```

That keeps the task aligned with the actual codebase contract.

Also correct the prose: the real unguarded write sites are three concrete calls (`addNode` at line 208, `addEdge` at 209, `addEdge` at 244), not “four unguarded store mutations”.

## Task 7: RC-D stickiness: clear lastIndexError on evidence of store health

The current red step is not valid against the real code.

`ensureIndexed()` already clears `lastIndexError` on any successful `indexProject()` return at `src/index.ts:103-108`:

```ts
const result = await indexProject(projectRoot, store);
if (result.errors > 0 && !dbIsWritable(projectRoot)) {
  lastIndexError = new Error("readonly database");
} else {
  lastIndexError = null;
}
```

With your current “throw once, then succeed” `listFiles()` patch, the second call will already clear the error before `finalizeReadOnlyOutput()` runs. That means Step 2 is not a real red test.

Rewrite the test so the store can still serve symbol data while indexing keeps throwing a non-readonly error. The easiest way is:
1. Pre-populate `.codegraph/graph.db` with `alpha`/`beta` using the same helper shape as `populateStore()` in `test/readonly-graceful-degradation.test.ts:61-73`.
2. Patch `SqliteGraphStore.prototype.listFiles` to throw on every call, not just the first one.
3. Call `symbol_graph` twice and assert the second output is clean because the read path succeeded.

The implementation must clear/suppress the transient note **before** it is prepended. The current proposed code computes the note first and only then nulls the error:

```ts
const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
if (lastIndexError && lastIndexError.message !== "readonly database") {
  lastIndexError = null;
}
```

That can only affect the *third* call. Reorder it so the comparison happens first:

```ts
const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
if (lastIndexError && lastIndexError.message !== "readonly database" && withoutFreshHeader.trim().length > 0) {
  lastIndexError = null;
}
const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
```

If you want the current call to stay clean, `indexingFailedNote()` must run after the transient-clear decision.

## Task 8: RC-D timestamp: indexingFailedNote emits age signal

This task currently bakes in Task 7’s incorrect post-prefix clear logic. After revising Task 7, update the same pre-prefix transient-clear comparison to use the new record shape.

Where Task 7 compares:

```ts
lastIndexError.message !== "readonly database"
```

Task 8 must compare:

```ts
lastIndexError.error.message !== "readonly database"
```

in the **same location where the transient-clear decision is made before `indexingFailedNote()` is prepended**.

The rest of the record-shape change is fine:

```ts
interface IndexErrorRecord { error: Error; setAt: number }
let lastIndexError: IndexErrorRecord | null = null;
```

and:

```ts
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  const ageSeconds = Math.max(0, Math.floor((Date.now() - lastIndexError.setAt) / 1000));
  return `indexing-failed (${ageSeconds}s ago): ${lastIndexError.error.message}\n`;
}
```

## Task 9: RC-E mutex: coalesce parallel ensureIndexed calls onto one in-flight promise

Absorb the end-to-end parallel clean-output regression here instead of leaving it for Task 10. This is the task that introduces the mutex, so this is where the red step is real.

Add the parallel-output regression to `test/ensure-indexed-mutex.test.ts` after the hook-based invocation-count test. Use the real tool execution path (as Task 10 drafted) and assert both:
- `indexCallCount === 1`
- neither output contains `indexing-failed`, `readonly database`, or `SQLITE_BUSY`

That keeps the regression with the implementation that actually fixes it.

## Task 10: Regression guard: reproduction scenario under full batch fix

As written, this is not a valid TDD task.

- Step 2 requires `git stash` / `git checkout`, which is disallowed by the workflow rules.
- Step 2 is not the same command as Step 4.
- After Tasks 2/3/7/8/9 land, `bun test test/ensure-indexed-error-message.test.ts` should already pass, so this task has no natural red step on the working branch.

Do not keep the current branch-swapping instructions:

```sh
git stash && git checkout main -- src/ && bun test test/ensure-indexed-error-message.test.ts
```

Move the drafted parallel regression into Task 9, where the mutex is introduced, and then either:
1. delete Task 10 from the plan, or
2. repurpose Task 10 into a pure suite-verification/wrap-up task outside the TDD task list.

Do not submit the plan with a task whose red step only exists by checking out another branch.
