---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
approved_tasks:
  - 1
needs_revision_tasks:
  - 2
  - 3
  - 4
  - 5
  - 6
---

### Task 1: Document the current Phase 5 baseline and local-history verification — ✅ PASS
No issues.

### Task 2: Record the telemetry window and materialize the decision matrix — ❌ REVISE
- Coverage is not mechanically traceable. Across `tasks/*.md`, only AC1/AC2 and AC4/AC7 are explicitly referenced; this task needs an explicit AC3/AC4 coverage note.
- Step 2 only checks for placeholder removal. It does not verify that the new helper file `test/phase5-decision-matrix.ts` is valid TypeScript or that its exports load.
- Because later tasks import `removedMutatingTools`, `removedDevTools`, `expectedDefaultPublicTools`, `expectedDefaultPublicToolDescriptions`, and `isRemoved` from this file, the task needs an import/type-check style verification step, not just grep.

### Task 3: Record the keep-branch regression checks for non-zero tools — ❌ REVISE
- The keep-branch commands do not cover AC7 for kept mutating tools. The real guarantees in `src/tools/resolve-edge.ts` and `src/tools/delete-edge.ts` are enforced by direct suites that are currently omitted: `test/tool-resolve-edge.test.ts`, `test/tool-resolve-edge-empty-evidence.test.ts`, `test/tool-resolve-edge-self-ref.test.ts`, and `test/tool-delete-edge.test.ts`.
- The keep-branch commands for dev-mode tools also omit the direct runtime suites (`test/tool-graph-query-*.test.ts`, `test/tool-graph-overview-*.test.ts`, `test/tool-dead-code-*.test.ts`). Extension wiring alone is not enough to claim the kept guarantees remain preserved.
- Add an explicit AC4/AC7 coverage note.

### Task 4: Apply the mutating-tool deletions from the decision matrix — ❌ REVISE
- Granularity is too coarse. One loop-based test over `removedMutatingTools` covers two different behaviors (`resolve_edge` removal and `delete_edge` removal), which violates the one-test/one-implementation rule.
- Coverage is incomplete for AC8. If a mutating tool is removed, the plan still leaves direct tool assertions behind. The repo currently contains `test/tool-resolve-edge.test.ts`, `test/tool-resolve-edge-empty-evidence.test.ts`, `test/tool-resolve-edge-self-ref.test.ts`, and `test/tool-delete-edge.test.ts`; none are addressed by this task.
- The task needs an explicit AC5/AC8 coverage note.
- Split this into one task per removed mutating tool, with tool-specific failing/passing commands and the corresponding test cleanup.

### Task 5: Apply the dev-mode tool deletions from the decision matrix — ❌ REVISE
- Granularity is too coarse. One loop-based test over `removedDevTools` covers up to three independent removals (`graph_query`, `graph_overview`, `dead_code`).
- Coverage is incomplete for AC8. The repo has direct tool assertion files that are not addressed at all:
  - `graph_query`: `test/tool-graph-query-*.test.ts`
  - `graph_overview`: `test/tool-graph-overview-*.test.ts`
  - `dead_code`: `test/tool-dead-code-*.test.ts`
- Broad helper-gating is not enough for AC8 if removed-tool assertions remain in pure tool-specific test files.
- The task needs an explicit AC6/AC8 coverage note.
- Split this into one task per removed dev-mode tool and account for the direct tool test files for each branch.

### Task 6: Reconcile README and ARCHITECTURE with the final Phase 5 surface — ❌ REVISE
- Dependency ordering is wrong. This task depends only on Task 2, but docs cannot be reconciled until the zero-usage removal tasks have been applied or explicitly skipped. As written, it can run before `src/index.ts` and tests reflect the final surface.
- Step 2 verification is too weak. It only checks that removed tool names are absent from `README.md` and `ARCHITECTURE.md`. That misses stale count/text mismatches like `5 public tools by default` or `3 dev-mode tools` after the final surface changes.
- The task needs an explicit AC8 coverage note.

### Missing Coverage
Acceptance-criterion identifiers missing from the task files:
- AC3
- AC5
- AC6
- AC8

### Verdict
revise — Tasks 2-6 need changes for explicit AC coverage, stronger verification, correct dependency ordering, and full test-surface handling for removed or kept tools. The required handoff is saved in `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/revise-instructions-1.md`.
