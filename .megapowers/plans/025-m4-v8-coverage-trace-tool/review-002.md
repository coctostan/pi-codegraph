---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 2
  - 3
  - 1
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
approved_tasks:
  - 2
  - 3
needs_revision_tasks:
  - 1
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
---

### Task 1: Add deterministic V8 coverage parser — ❌ REVISE
- Step 1 test snippet is non-compiling (`appSource`, `appText`, `testText` undeclared).
- Step 3 implementation block is structurally incomplete (missing declarations/loops) and cannot compile as written.
- AC2/AC4 are not explicitly tested (ignore non-local/non-ts URLs; skip malformed JSON without abort).

### Task 2: Map coverage ranges to graph nodes — ✅ PASS
- Dependency/order is correct.
- Test behavior aligns with AC5/AC6 and implementation uses existing store APIs.

### Task 3: Persist coverage-backed test traces in SQLite — ✅ PASS
- Dependency/order is correct.
- Store interface + SQLite schema/API additions are coherent with existing codebase.
- Test validates replacement semantics and stored hash persistence.

### Task 4: Index coverage artifacts into tested_by edges and stored traces — ❌ REVISE
- Step 1 test snippet is non-compiling (missing required declarations).
- Step 3 code blocks are syntactically incomplete (`coverage.ts`, `pipeline.ts`) and reference undefined symbols.
- Coverage-to-edge mapping logic is incorrect as written (cross-product behavior; not per coverage group), risking AC7/AC9 violations.
- Pipeline snippet drops existing required structure (`currentRel`, imports/types), so not self-contained.

### Task 5: Return coverage-backed traces for tests and production symbols — ❌ REVISE
- Step 1 test snippet is non-compiling (missing `test()` wrapper, missing store creation, missing `byProd` assignment, missing `addNode(alpha)`).
- Step 3 implementation snippet is incomplete (undefined `testTraceId`, `record`, `lines`).
- Needs explicit deterministic selection behavior in runnable code.

### Task 6: Resolve endpoint entries to coverage-backed traces — ❌ REVISE
- Step 1 test snippet is non-compiling (missing `test()` wrapper/store declaration).
- Test does not actually set up route relationship (`routes_to`) needed for endpoint resolution.
- Step 3 snippet is partial and not self-contained.

### Task 7: Fall back to deterministic static traces when coverage is missing — ❌ REVISE
- Missing explicit `ACs covered` annotation.
- Implementation snippet includes endpoint logic despite dependency only on Task 5 (dependency leakage from Task 6), so ordering/self-containment is ambiguous.

### Task 8: Mark stale and unresolved trace steps without failing the trace — ❌ REVISE
- Step 1 test snippet is non-compiling (missing wrapper/store creation).
- Step 3 snippet references undefined `coverageTraceId`; not executable as written.
- Needs explicit preservation of both stale signals (anchor stale + stored hash mismatch).

### Task 9: Wire the trace tool into the extension — ❌ REVISE
- Step 3 proposes an incomplete full-file rewrite with missing declarations; not self-contained.
- Should be a minimal delta task (import + schema + tool registration) to keep realism and reduce break risk.

### Coverage summary
- AC coverage exists at plan level, but execution-level coverage is currently weakened by non-compiling task steps and missing explicit assertions (especially Task 1 for AC2/AC4 and Task 6 endpoint setup).

### Dependency summary
- No cycles.
- Main issue: Task 7 currently includes behavior that implies Task 6 dependency but does not declare it.

A prescriptive handoff has been written to `.megapowers/plans/025-m4-v8-coverage-trace-tool/revise-instructions-2.md`.
