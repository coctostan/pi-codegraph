---
id: 10
title: "Full-suite verification: bun test clean under full batch fix"
status: approved
depends_on:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
no_test: true
files_to_modify:
  - .megapowers/plans/072-harden-ensureindexed-error-path-real-mes/plan.md
files_to_create: []
---

Regression coverage for the original reproduction scenario
(parallel first-run `symbol_graph` calls with a transient LSP-stage write
fault) now lives inside Task 9's `test/ensure-indexed-mutex.test.ts` — that
is the task that introduces the mutex, so it is the correct home for the
red step.

This task is a pure suite-verification / wrap-up step and does not add any
new production code or new test file. `[no-test]` is justified because the
observable behaviour for every Fixed-When criterion is already covered by
Tasks 1–9, each of which ships with its own passing test.

**Files:**
- Modify: `.megapowers/plans/072-harden-ensureindexed-error-path-real-mes/plan.md` (update the Fixed-When checklist to point #9 at the Task 9 reset assertion)

**Verification — step 1: full test suite runs clean**

Run: `bun test`

Expected: all tests passing, including:

- `test/ensure-indexed-error-message.test.ts` (Task 1)
- `test/lsp-stage-guarded-writes.test.ts` (Tasks 2 + 3)
- `test/git-stage-guarded-writes.test.ts` (Task 4)
- `test/ast-grep-guarded-writes.test.ts` (Task 5)
- `test/pipeline-stage-error-accounting.test.ts` (Task 6)
- `test/last-index-error-clear-on-health.test.ts` (Task 7)
- `test/indexing-failed-note-age.test.ts` (Task 8)
- `test/ensure-indexed-mutex.test.ts` (Task 9, includes the explicit
  `resetStoreForTesting` reset-of-new-module-state assertion)
- `test/readonly-graceful-degradation.test.ts` (pre-existing readonly DB
  coverage)

**Verification — step 2: Fixed-When checklist**

Manually confirm every acceptance criterion from the diagnosis `Fixed When`
section is covered by a specific green test:

- Fixed When #1 → Task 1 test
- Fixed When #2 → Task 2 + Task 3 tests
- Fixed When #3 → Task 4 test
- Fixed When #4 → Task 5 tests
- Fixed When #5 → Task 6 test
- Fixed When #6 → Task 7 test
- Fixed When #7 → Task 8 test
- Fixed When #8 → Task 9 invocation-count test
- Fixed When #9 → Task 9 test explicitly asserts that
  `resetStoreForTesting()` clears the new `indexProjectImpl` override and
  `indexingInFlight` state introduced by Tasks 8 and 9 (the post-reset
  `expect(indexCallCount).toBe(1)` + `expect(secondCallCount).toBe(1)`
  assertions)
- Fixed When #10 → this task's full-suite run

No new files. No test-writing branch. No `git stash` / `git checkout`.
