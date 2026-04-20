---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 4
  - 6
  - 1
  - 2
  - 3
  - 5
  - 7
  - 8
  - 9
  - 10
approved_tasks:
  - 4
  - 6
needs_revision_tasks:
  - 1
  - 2
  - 3
  - 5
  - 7
  - 8
  - 9
  - 10
---

### Task 1: RC-C: indexingFailedNote surfaces lastIndexError.message verbatim — ❌ REVISE
- The red test uses an LSP `addEdge` throw path that Tasks 2–3 intentionally guard. That makes AC #1 unstable across the batch and forces Task 2 to rewrite Task 1’s regression.
- Rebase the test onto a non-LSP throw site that still reaches `ensureIndexed.catch`, e.g. `SqliteGraphStore.prototype.listFiles`, which is used outside per-item guards in `src/indexer/pipeline.ts:96` / `src/indexer/lsp.ts:46`.

### Task 2: RC-A/LSP: guard unresolved-branch write pair in runLspIndexStage — ❌ REVISE
- Step 1’s fixture does not hit the fake client branches. `runLspIndexStage()` calls `client.definition()` with the line parsed from `edge.provenance.evidence` (`src/indexer/lsp.ts:61-67`), but the task uses `targetA:10:1` / `targetB:20:1` while the fake client checks for lines `2` / `5`.
- As written, `loc` is `null`, no LSP write happens, and Step 2’s expected `SQLITE_BUSY` failure is unreachable.
- The task also edits `test/ensure-indexed-error-message.test.ts` in Step 5 without listing it in frontmatter, and it expands scope to two test files / two behaviors.

### Task 3: RC-A/LSP: guard confirmed-branch write pair in runLspIndexStage — ❌ REVISE
- Same evidence/line mismatch as Task 2. The task’s `resolvedA` / `resolvedB` evidence uses `10` / `20`, but the fake client branches on `2` / `5`.
- That means the confirmed branch never reaches the guarded `addEdge` write, so Step 2’s expected failure at `src/indexer/lsp.ts:91` is not reproducible.

### Task 4: RC-A/git: guard writes in runGitCoChangeStage — ✅ PASS
No issues.

### Task 5: RC-A/ast-grep: guard writes in applyRoutesToMatches and applyRendersMatches — ❌ REVISE
- The route-rule fixture uses the wrong template syntax for the real API. `renderTemplate()` in `src/indexer/ast-grep.ts:178-185` replaces `{METHOD}` / `{PATH}`, and the bundled rule uses `endpoint:{METHOD}:{PATH}` in `src/rules/express.yaml:7`.
- `to_template: "endpoint::${METHOD}::${PATH}"` is not the codebase’s actual contract.

### Task 6: RC-A accounting: per-stage write errors bump IndexResult.errors — ✅ PASS
No issues.

### Task 7: RC-D stickiness: clear lastIndexError on evidence of store health — ❌ REVISE
- The proposed red test is not red on the real code. `ensureIndexed()` already clears `lastIndexError` on any successful `indexProject()` return at `src/index.ts:103-108`, so a “throw once, then succeed” setup will already produce a clean second call before `finalizeReadOnlyOutput()` runs.
- The Step 3 code clears the flag after `indexingFailedNote()` has already been prepended. That can only affect a later call, not the current one, so it does not satisfy the task’s own expectation that the second call is clean.

### Task 8: RC-D timestamp: indexingFailedNote emits age signal — ❌ REVISE
- This task hardcodes the Task 7 implementation shape that needs revision. Its `finalizeReadOnlyOutput` update assumes the transient-clear check still happens after the note is built.
- Revise it to update the corrected pre-prefix clear site introduced by Task 7, using `lastIndexError.error.message` instead of `lastIndexError.message`.

### Task 9: RC-E mutex: coalesce parallel ensureIndexed calls onto one in-flight promise — ❌ REVISE
- The mutex implementation itself is sound, but Task 10’s end-to-end parallel clean-output regression belongs here. This is the task that introduces the coalescing behavior, so this is where the regression’s red step is real.
- Absorb the parallel output regression into this task instead of leaving it as a separate post-fix task.

### Task 10: Regression guard: reproduction scenario under full batch fix — ❌ REVISE
- Step 2 requires `git stash` / `git checkout`, which is disallowed by workflow rules.
- Step 2 is not the same command as Step 4, so the TDD loop is invalid.
- After Tasks 2/3/7/8/9 land, this test should already pass on the working branch; the only way it goes red here is by checking out older code. That makes it unsuitable as a standalone TDD task.

### Missing Coverage
- No acceptance criterion is completely uncovered; plan.md maps Fixed When #1-#10 to tasks.
- Coverage is brittle around AC #1 because the current Task 1 regression source is later removed by Tasks 2–3, which is why Tasks 1–2 need revision.

### Verdict
revise
