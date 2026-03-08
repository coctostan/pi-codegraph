---
type: plan-review
iteration: 3
verdict: revise
reviewed_tasks:
  - 1
  - 3
  - 6
  - 8
  - 2
  - 4
  - 5
  - 7
  - 9
approved_tasks:
  - 1
  - 3
  - 6
  - 8
needs_revision_tasks:
  - 2
  - 4
  - 5
  - 7
  - 9
---

### Task 1: Add deterministic V8 coverage parser — ✅ PASS
- AC coverage is explicit (AC 1–4) and the test exercises deterministic ordering, unsupported URL filtering, and malformed JSON skipping.
- Steps 1–5 are present with realistic Bun commands.

### Task 2: Map coverage ranges to graph nodes — ❌ REVISE
- **TDD/realism issue (Step 3):** the provided full-file code drops Task 1 parser guards (`existsSync`, malformed JSON catch), which would regress AC 1/4 behavior and likely fail full suite.
- **Self-containment issue:** implementation should patch Task 1 file, not replace it with a reduced parser.

### Task 3: Persist coverage-backed test traces in SQLite — ✅ PASS
- Correct dependency on Task 2.
- Steps 1–5 are complete, API additions are coherent (`GraphStore` + `SqliteGraphStore`), and run commands match repo conventions.

### Task 4: Index coverage artifacts into tested_by edges and stored traces — ❌ REVISE
- **Step 1 test has compile/runtime issues:** `testedBy` is asserted but never defined.
- **Step 3 implementation has non-working code:** missing declarations/loops (`records`, `record`, `resolved`, malformed `walkTsFiles`, missing `indexed` init).
- **Step 2 expected failure mismatch:** currently claims behavior failure but actual first failure would be syntax/reference errors.
- **Granularity:** test combines multiple behaviors (edge creation + trace persistence + dedupe rerun) and should be split for one-test/one-implementation flow.

### Task 5: Return coverage-backed traces for tests and production symbols — ❌ REVISE
- **Step 3 implementation is incomplete:** `pickCoverageTraceForNode()` references `candidate` without a `for` loop (non-compiling snippet).
- Needs a valid deterministic candidate iteration loop.

### Task 6: Resolve endpoint entries to coverage-backed traces — ✅ PASS
- Dependency and scope are appropriate.
- Test and implementation align with current graph API (`routes_to` in-neighbors, `tested_by` out-neighbors).

### Task 7: Fall back to deterministic static traces when coverage is missing — ❌ REVISE
- **Step 1 test is not executable:** missing `test(...)` wrapper, missing `store` initialization, missing `store.addNode(entry)`, missing `output` definition.
- **Step 3 implementation is syntactically incomplete:** missing `TraceParams` interface declaration line and broken `buildStaticTrace` loop structure.
- **Step structure issue:** Step 5 label is missing/merged.

### Task 8: Mark stale and unresolved trace steps without failing the trace — ✅ PASS
- AC mapping is explicit (AC 16, 18).
- Steps 1–5 are present and implementation approach is consistent with existing `computeAnchor()` stale semantics.

### Task 9: Wire the trace tool into the extension — ❌ REVISE
- **Step 1 test snippet is incomplete/non-executable:** no `test(...)` wrapper, `traceTool` undefined.
- Must append a complete test block to `test/extension-wiring.test.ts` (not replace existing tests).
- Step sequencing needs explicit Step 3 heading for implementation instructions.

### Coverage check
- All acceptance criteria (1–19) are covered by at least one task.
- No AC coverage gaps found.

### Ordering/dependencies
- Dependency graph is generally correct (no cycles found).
- Execution would still fail due the above per-task code validity issues.

I wrote prescriptive fix guidance to:
`.megapowers/plans/025-m4-v8-coverage-trace-tool/revise-instructions-3.md`
