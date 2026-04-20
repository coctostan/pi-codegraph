---
type: plan-review
iteration: 3
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 9
  - 10
  - 7
  - 8
approved_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 9
  - 10
needs_revision_tasks:
  - 7
  - 8
---

### Task 1: RC-C: indexingFailedNote surfaces lastIndexError.message verbatim — ✅ PASS
Positive assertion on `"tsserver crashed"` restored. Red/green is real: baseline output contains `"readonly database"` (hardcoded literal) and never `"tsserver crashed"`; Task 1's note change makes it contain the real message.

### Task 2: RC-A/LSP: guard unresolved-branch write pair — ✅ PASS (unchanged from last round).

### Task 3: RC-A/LSP: guard confirmed-branch write pair — ✅ PASS
`store.setFileHash("src/y.ts", "h")` added so the confirmed branch is reached. Red step (`SQLITE_BUSY` propagating from `src/indexer/lsp.ts:91`) now corresponds to real baseline behaviour.

### Task 4: RC-A/git: guard writes in runGitCoChangeStage — ✅ PASS (unchanged).

### Task 5: RC-A/ast-grep: guard writes in applyRoutes/applyRenders — ✅ PASS
`routes_to` test now faults `SqliteGraphStore.prototype.addNode` and asserts `endpointNodeWrites === 2` plus the second match's edge persistence — this forces the implementation to wrap `store.addNode(endpointNode)` at `src/indexer/ast-grep.ts:208`. Task description explicitly notes two guarded sites.

### Task 6: RC-A accounting: per-stage write errors bump IndexResult.errors — ✅ PASS (unchanged).

### Task 7: RC-D stickiness: clear lastIndexError on evidence of store health — ❌ REVISE
- **Red step is not actually red.** With `listFiles` throwing only on call-1 and `listFilesCalls` branching to normal behaviour on call-2, the existing happy-path clear at `src/index.ts:106-107` already nulls `lastIndexError` on call-2 (baseline `result.errors === 0`, so the `else` branch fires). The second tool call's output is clean on baseline, without any Task 7 implementation.
- Step 2's expected FAIL (`Expected not to contain: "indexing-failed"` / `Received: "indexing-failed: transient scan failure..."`) does not match what Bun actually prints on baseline — call-2's note is already empty.
- Fix: either (A) make the test helper-based and assert `getLastIndexErrorForTesting()` becomes `null` after a single successful tool call (recommended — minimally invasive, requires a `setLastIndexErrorForTesting` helper in Step 3), or (B) make `listFiles` throw on every call and revert to pre-prefix clear with coordinated Task 1 refactor. Full prescription with copy-pasteable test body in `revise-instructions-3.md`.

### Task 8: RC-D timestamp: indexingFailedNote emits age signal — ❌ REVISE (dependent on Task 7)
- If Task 7 adopts Option A from the revise instructions, Task 8 must change "add two test-only helpers" to "extend `setLastIndexErrorForTesting` to the `(error, setAt)` signature and add `getIndexingFailedNoteForTesting`". Without this wording fix, Task 8 and Task 7 both claim to introduce the same setter.

### Task 9: RC-E mutex: coalesce parallel ensureIndexed calls — ✅ PASS
Focused scope (one test). Explicit post-reset `expect(indexCallCount).toBe(1)` + `expect(secondCallCount).toBe(1)` assertions genuinely exercise the new `indexProjectImpl` reset and `indexingInFlight` clear introduced in Step 3. Fixed When #9 is now concretely covered.

### Task 10: Full-suite verification — ✅ PASS
Frontmatter and body reconciled. Fixed-When #9 now points at the Task 9 reset assertion (which exists after the Task 9 revision).

### Missing Coverage
No AC is numerically unmapped. Effective coverage gap is at Fixed When #6, which is not actually forced by Task 7's current red step. Fixing Task 7 per the revise instructions closes it.

### Verdict
- **revise** — Task 7 needs a real red/green driver and Task 8 needs a one-line wording coordination. All other tasks are ready for implementation.
