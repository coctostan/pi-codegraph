---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 2
  - 4
  - 6
  - 1
  - 3
  - 5
  - 7
  - 8
  - 9
  - 10
approved_tasks:
  - 2
  - 4
  - 6
needs_revision_tasks:
  - 1
  - 3
  - 5
  - 7
  - 8
  - 9
  - 10
---

### Task 1: RC-C: indexingFailedNote surfaces lastIndexError.message verbatim — ❌ REVISE
- Step 1 does not force Fixed When #1 anymore. `expect(sgText).not.toContain("readonly database")` + `expect(sgText).toContain("alpha")` would also pass if `indexingFailedNote()` returned an empty string.
- Restore a positive assertion on the real message text (`tsserver crashed`) or otherwise add a deterministic note-rendering assertion. As written, the task no longer proves that the captured non-readonly message is surfaced.

### Task 2: RC-A/LSP: guard unresolved-branch write pair in runLspIndexStage — ✅ PASS
No issues.

### Task 3: RC-A/LSP: guard confirmed-branch write pair in runLspIndexStage — ❌ REVISE
- Step 1 never reaches the confirmed-edge branch. `runLspIndexStage()` builds `confirmed` from `store.listFiles()` (`src/indexer/lsp.ts:45-54`), but the test never calls `store.setFileHash("src/y.ts", "h")`, so `store.listFiles()` returns `[]`.
- Because the branch is never exercised, the current red-step expectation (`SQLITE_BUSY...` propagates) is inaccurate. Baseline behavior is `lspCalls === 0`, not a thrown write error.

### Task 4: RC-A/git: guard writes in runGitCoChangeStage — ✅ PASS
No issues.

### Task 5: RC-A/ast-grep: guard writes in applyRoutesToMatches and applyRendersMatches — ❌ REVISE
- The `routes_to` test only patches `SqliteGraphStore.prototype.addEdge`, so it does not force the `store.addNode(endpointNode)` guard at `src/indexer/ast-grep.ts:208`.
- An implementation that guards only `store.addEdge(...)` and leaves `store.addNode(...)` unguarded would still pass this task.
- Granularity is also off: the task currently bundles two behaviors (`routes_to` and `renders`) into one implementation task.

### Task 6: RC-A accounting: per-stage write errors bump IndexResult.errors — ✅ PASS
No issues.

### Task 7: RC-D stickiness: clear lastIndexError on evidence of store health — ❌ REVISE
- Step 1’s code block is syntactically incomplete: the `describe(...)` block is never closed.
- The test title/prose says the *second* call should be clean, but the assertions require **both** calls to be clean. The task description and the code need to say the same thing.

### Task 8: RC-D timestamp: indexingFailedNote emits age signal — ❌ REVISE
- The current Step 1 strategy is incompatible with Task 7’s pre-prefix clear. After Task 7, a successful `symbol_graph("alpha")` call produces non-empty output, so `finalizeReadOnlyOutput()` clears the transient error before the note is rendered.
- That means the proposed regex assertion against `t1` is not a real red/green driver.
- The task should use a deterministic helper-based test for the note formatter, not public tool output on a successful read path.
- The second test is extra behavior for the same implementation task.

### Task 9: RC-E mutex: coalesce parallel ensureIndexed calls onto one in-flight promise — ❌ REVISE
- Fixed When #9 is not directly tested. The current plan treats incidental `resetStoreForTesting()` calls as coverage, but no test actually fails if `resetStoreForTesting()` forgets to clear `indexProjectImpl` or the new in-flight state.
- The task also bundles three behaviors: parallel coalescing, sequential rerun semantics, and the clean-output regression. It needs a tighter red/green scope.

### Task 10: Full-suite verification: bun test clean under full batch fix — ❌ REVISE
- This task currently papers over missing Fixed When #9 coverage by claiming it is implicitly covered. That is not sufficient for a no-test wrap-up task.
- Frontmatter/body are inconsistent: `files_to_modify` lists `plan.md`, while the body says `Files: none`.

### Missing Coverage
- No criterion is numerically unmapped in `plan.md`, but effective coverage is still missing for:
  - **Fixed When #1** — the exact-message requirement is not forced by Task 1 as written.
  - **Fixed When #9** — there is no direct task-level regression test proving `resetStoreForTesting()` resets the new module-level state.

### Verdict
- **revise** — Tasks 1, 3, 5, 7, 8, 9, and 10 need changes before the plan is ready for implementation.
