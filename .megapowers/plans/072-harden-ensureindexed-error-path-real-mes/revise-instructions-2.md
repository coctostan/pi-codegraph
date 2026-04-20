## Task 3: RC-A/LSP: guard confirmed-branch write pair in runLspIndexStage

Your red test does not currently reach the confirmed-edge branch.

`runLspIndexStage()` builds `confirmed` by iterating `store.listFiles()` and then `store.getNodesByFile(file)` (`src/indexer/lsp.ts:45-54`). In the Step 1 snippet you seed nodes and edges for `src/y.ts`, but you never add a file-hash row for that file, so `store.listFiles()` returns `[]` and the confirmed branch never runs.

Add this before patching `SqliteGraphStore.prototype.addEdge`:

```ts
store.setFileHash("src/y.ts", "h");
```

With that fix in place, the existing red-step expectation (`SQLITE_BUSY: database is locked` propagating from the confirmed branch) becomes real. Without it, the actual failure is just `expect(lspCalls).toBe(2)` with `Received: 0`.

## Task 1: RC-C: indexingFailedNote surfaces lastIndexError.message verbatim

Step 1 no longer forces the behavior in Fixed When #1.

These assertions are too weak:

```ts
expect(sgText).not.toContain("readonly database");
expect(sgText).toContain("alpha");
```

That would also pass if `indexingFailedNote()` returned `""`, which means the task no longer proves that the real non-readonly message is surfaced.

Restore a positive assertion on the captured message text. The red/green check must require the rendered note to include the real message, e.g.:

```ts
expect(sgText).toContain("tsserver crashed");
expect(sgText).not.toContain("readonly database");
```

If you keep Task 7's current-call suppression design, then Task 1 and Task 8 need to be revised together so there is still one deterministic place where the note text itself is asserted. Do not resubmit with Task 1 only checking `not.toContain("readonly database")`.

## Task 5: RC-A/ast-grep: guard writes in applyRoutesToMatches and applyRendersMatches

The task still does not force the `store.addNode(endpointNode)` guard at `src/indexer/ast-grep.ts:208`.

Right now the `routes_to` test only patches `SqliteGraphStore.prototype.addEdge`. That means an implementation that guards only `store.addEdge(...)` and leaves `store.addNode(endpointNode)` unguarded would still pass, which is not enough for AC #4.

Change the `routes_to` red test to fault `addNode`, not `addEdge`:

```ts
const originalAddNode = SqliteGraphStore.prototype.addNode;
let endpointNodeWrites = 0;
SqliteGraphStore.prototype.addNode = function (node) {
  if (node.kind === "endpoint") {
    endpointNodeWrites++;
    if (endpointNodeWrites === 1) throw new Error("SQLITE_BUSY: database is locked");
  }
  return originalAddNode.call(this, node);
};
```

Then assert the second match still persists a `routes_to` edge and that `endpointNodeWrites === 2`.

Keep the `renders` case on `addEdge` if you want that second guarded site in the same task, but the task text must explicitly say it is covering two guarded sites. If you want to satisfy the one-behavior-per-task guideline strictly, split `routes_to` and `renders` into separate tasks instead of keeping both tests under Task 5.

## Task 7: RC-D stickiness: clear lastIndexError on evidence of store health

The Step 1 test snippet is syntactically incomplete.

The code block opens both `describe(..., () => {` and `test(..., async () => {`, but only closes one of them. Make the snippet end like this:

```ts
    } finally {
      SqliteGraphStore.prototype.listFiles = origListFiles;
      mod.resetStoreForTesting();
    }
  });
});
```

Also fix the test name / prose to match what the body actually asserts. The current title says `"second tool call's output is clean..."`, but the assertions require **both** calls to be clean. Either:

1. keep the current stronger behavior and rename the test/comments so they say both calls are clean under repeated transient failures, or
2. revert the assertions to first-call note + second-call clean and update the implementation accordingly.

Do not leave the title/comments claiming one behavior while the code asserts another.

## Task 8: RC-D timestamp: indexingFailedNote emits age signal

The current test strategy is incompatible with Task 7.

After Task 7, `finalizeReadOnlyOutput()` clears transient errors before prefixing the note whenever `withoutFreshHeader.trim().length > 0`. A successful `symbol_graph("alpha")` call produces non-empty output, so the note is cleared before it is rendered. That means this Step 1 assertion can never be the red/green driver you claim:

```ts
expect(t1).toMatch(/^indexing-failed \(\d+s ago\): transient scan failure/m);
```

Replace the tool-output strategy with a deterministic helper-based test. In `src/index.ts`, add small test-only helpers around the new `IndexErrorRecord` shape:

```ts
export function setLastIndexErrorForTesting(error: Error | null, setAt: number = Date.now()): void {
  lastIndexError = error ? { error, setAt } : null;
}

export function getIndexingFailedNoteForTesting(now: number = Date.now()): string {
  if (!lastIndexError) return "";
  const ageSeconds = Math.max(0, Math.floor((now - lastIndexError.setAt) / 1000));
  return `indexing-failed (${ageSeconds}s ago): ${lastIndexError.error.message}\n`;
}

function indexingFailedNote(): string {
  return getIndexingFailedNoteForTesting();
}
```

Then make the test direct and deterministic:

```ts
const mod = await import("../src/index.js");
mod.resetStoreForTesting();
mod.setLastIndexErrorForTesting(new Error("transient scan failure"), 1_000);
expect(mod.getIndexingFailedNoteForTesting(4_500)).toBe(
  "indexing-failed (3s ago): transient scan failure\n",
);
```

If you want a prefix/back-compat assertion, make it a second assertion on the same returned string (`expect(note).toContain("indexing-failed")`) instead of a separate second test in the same task.

## Task 9: RC-E mutex: coalesce parallel ensureIndexed calls onto one in-flight promise

Two issues remain here.

### 1) Fixed When #9 still lacks a real test

Your current plan says `resetStoreForTesting` coverage comes from “every test that calls `mod.resetStoreForTesting()`”. That is not a regression test. Nothing in Task 9 currently fails if `resetStoreForTesting()` forgets to restore `indexProjectImpl` or clear the new in-flight state.

Add an explicit assertion that `resetStoreForTesting()` resets the new module-level state introduced in this batch. For example:

```ts
let overrideCalls = 0;
mod.setIndexProjectForTesting(async () => {
  overrideCalls++;
  return { indexed: 0, skipped: 0, removed: 0, errors: 0, timings: {} };
});

mod.resetStoreForTesting(); // should restore indexProjectImpl and clear indexingInFlight

let secondCalls = 0;
mod.setIndexProjectForTesting(async () => {
  secondCalls++;
  return { indexed: 0, skipped: 0, removed: 0, errors: 0, timings: {} };
});

await sgExecute!("after-reset", { name: "alpha" }, undefined, undefined, { cwd: root });
expect(overrideCalls).toBe(0); // first override was cleared by reset
expect(secondCalls).toBe(1);   // fresh override runs after reset
```

That is the minimum needed to make Fixed When #9 real.

### 2) Task 9 is over-bundled

Right now Task 9 contains three distinct behaviors:
- parallel coalescing count
- sequential rerun semantics
- end-to-end clean-output regression

Keep the mutex count test as the primary red/green driver, and fold the reset assertion above into that same focused task. Move the extra clean-output regression into a separate task or into a verification step. Do not leave Task 9 as three loosely related tests.

## Task 10: Full-suite verification: bun test clean under full batch fix

Two follow-ups are needed here.

1. The frontmatter is inconsistent with the body. If this is truly a pure `[no-test]` verification task, `files_to_modify` should be `[]`, not `plan.md`.
2. The Fixed-When checklist currently claims:

```md
- Fixed When #9 → `resetStoreForTesting` updates in Task 9 Step 3 (covered by every test that calls `mod.resetStoreForTesting()`)
```

That is not sufficient. After you add the explicit Task 9 reset test above, point Fixed When #9 at that concrete test instead.

Do not resubmit with Task 10 still papering over missing AC #9 coverage.
