---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
approved_tasks: []
needs_revision_tasks:
  - 1
  - 2
---

### Per-Task Assessment

### Task 1: Regression-test indexProject against empty sg stdout — ❌ REVISE
- **Coverage:** This is the right integration scenario for AC3 and the integration half of AC4, but the task does **not explicitly label which ACs it covers**.
- **TDD / realism:** Step 2 says the new test should fail with `Invalid sg JSON output: JSON Parse error: Unexpected EOF`, but the current checkout already contains the production fix in `src/indexer/ast-grep.ts` (`if (!stdout.trim()) return [];`). On this codebase, that failure is no longer realistic.
- **Implementation correctness:** Step 3 tells the implementer to replace `runScan()` with `if (stdout === "") return [];`. That would **regress** current behavior by dropping whitespace-only handling.
- **Self-containment:** The test code itself is realistic and matches existing imports/APIs in `test/indexer-index-project.test.ts`, but the production-code edit is not valid for current HEAD.

### Task 2: Normalize whitespace-only sg output without masking malformed JSON — ❌ REVISE
- **Coverage:** This task touches AC1 and AC2, but again it does **not explicitly call out AC coverage**.
- **Granularity:** The Step 1 test covers **multiple behaviors in one test**: whitespace-only stdout returns `[]` **and** malformed non-empty JSON still throws. That should be split.
- **Coverage gap:** The plan still lacks a **direct subprocess-boundary regression for the original empty-stdout bug**. The only empty-stdout coverage is the integration task.
- **TDD / realism:** Step 2 claims the test should fail with `Unexpected EOF`, but current `runScan()` already handles whitespace-only stdout, so that RED step is not realistic on this checkout.
- **Implementation correctness:** Step 3 duplicates the already-correct current implementation in `src/indexer/ast-grep.ts`; it is not a meaningful implementation step.
- **Self-containment:** The test file and imports are correct (`runScan`, `AstGrepRule`, `ExecFn`, existing `rule` constant), but the task needs to be split into separate direct-boundary regression tasks.

### Missing Coverage
- No task explicitly calls out which acceptance criteria it covers.
- No task provides a **direct `runScan()` test for the original empty-stdout subprocess case** required by AC4’s subprocess-boundary regression expectation.

### Verdict
revise
