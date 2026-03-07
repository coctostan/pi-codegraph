---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 3
  - 8
  - 2
  - 4
  - 5
  - 6
  - 7
  - 9
  - 10
approved_tasks:
  - 1
  - 3
  - 8
needs_revision_tasks:
  - 2
  - 4
  - 5
  - 6
  - 7
  - 9
  - 10
---

### Per-Task Assessment

### Task 1: Add pure impact traversal and classification — ✅ PASS
The traversal/classification approach matches the current `GraphStore` API (`findNodes`, `getNeighbors`) and is implementable in one file. The BFS + `seen` set is sufficient to satisfy the cycle and `maxDepth` requirements.

### Task 2: Add anchored impact output and register the impact tool — ❌ REVISE
- Step 3 is not self-contained: the `src/tools/impact.ts` snippet is missing declarations and uses undeclared identifiers (`queue`, `inbound`, `classification`). It will not compile as written.
- The `src/index.ts` snippet drops the actual `impact(...)` call before returning, so the registration example is incomplete.
- The fallback `"No downstream impact detected.\n"` introduces prose output even though the spec calls for structured anchored output.
- The output formatting does not preserve the existing anchor/stale semantics from `computeAnchor()`.

### Task 3: Index TSX files with the tree-sitter stage — ✅ PASS
The plan fits the current codebase: `walkTsFiles()` is the right pipeline seam, and `tree-sitter-typescript` exposes both `typescript` and `tsx` languages. The fake `ITsServerClient` matches the real interface in `src/indexer/tsserver-client.ts`.

### Task 4: Load and validate bundled and project-local ast-grep rules — ❌ REVISE
- The validation model is too hard-coded to the bundled Express/React pairings. AC 18–21 describe a generic rule-engine contract, but the task only allows `routes_to => from_capture + to_template` and `renders => from_context + to_capture`.
- Because of that hard-coding, the task only partially covers the rule schema requirements. The loader should validate source/target strategies independently of `edge_kind`.
- Step 1 needs at least one success case proving the loader accepts the strategy combinations generically, not just the two bundled rules.

### Task 5: Add the sg subprocess scan wrapper — ❌ REVISE
- Step 3 is incomplete: `cmd` is never defined before `execFn(cmd, { cwd: projectRoot })`.
- The task should show the exact working subprocess invocation for the real CLI contract (`sg run --json --lang ... --pattern ... <files...>`), otherwise the RED/GREEN steps are not executable from the plan alone.

### Task 6: Create endpoint nodes and routes_to edges from Express matches — ❌ REVISE
- Step 1 test code is broken: it references `endpoint` and `aRoutes` without declaring them.
- Step 3 uses `method` without defining it.
- The implementation hard-codes endpoint-id construction instead of expanding `rule.produces.to_template`, so it does not actually satisfy the rule-engine side of AC 21.
- This task should use the existing store APIs (`findNodes(name, file)`, `addNode`, `addEdge`) with a real template-expansion helper.

### Task 7: Create renders edges from React matches with enclosing function lookup — ❌ REVISE
- Step 3 is not executable: `sourceNode` and `targetNode` are used but never defined in the snippet.
- The task needs to show the actual `store.getNodesByFile(match.file)` + `smallestContainingFunction(...)` lookup and same-file target resolution with `store.findNodes(targetName, match.file)[0]`.
- The intended behavior for this task is same-file `enclosing_function` resolution; the production snippet should stay scoped to that.

### Task 8: Run the ast-grep stage from the pipeline and keep Stage 3 incremental behavior correct — ✅ PASS
For the current milestone scope, the integration plan is feasible: `indexProject(projectRoot, store, options?)` is the correct seam, `changedFiles` is the correct file set to hand to Stage 3, and the task correctly places Stage 3 into the shared store-backed pipeline.

### Task 9: Index React renders from a real TSX fixture — ❌ REVISE
- The task overreaches beyond the spec by adding cross-file render target lookup. AC 41 only requires a TSX React fixture that produces the expected `renders` edge; it does not require cross-file resolution.
- More importantly, the cross-file fallback is architecturally unsafe with the current incremental design. `indexProject()` only rescans changed files, and `store.deleteFile(rel)` deletes nodes/edges touching the changed file. If the target component file changes but the source TSX file does not, the cross-file `renders` edge can disappear and never be rebuilt.
- This task should be reduced to integration coverage for the same-file React rule instead of introducing new production behavior.

### Task 10: Confirm changed-file reindex replacement without Stage 3 deleteFile helpers — ❌ REVISE
- This is not valid TDD as written. Step 2 is already GREEN because Task 8 implements the behavior first.
- A standalone task whose RED step says the test already passes violates the required RED → GREEN flow.
- The coverage belongs inside Task 8’s integration test instead of a separate post-hoc regression-only task.

### Missing Coverage
- AC 18–21 are only partially covered in the current plan. The tasks cover the bundled Express and React rule shapes, but they do not yet describe a generic rule engine that accepts `from_capture` / `from_context` and `to_capture` / `to_template` independently of edge kind.

### Verdict
**revise** — Tasks 2, 4, 5, 6, 7, 9, and 10 need adjustment before implementation. The main issues are incomplete/non-compiling Step 3 snippets, an over-hard-coded rule schema that does not fully satisfy AC 18–21, and the cross-file React refinement in Task 9 introducing an incremental-indexing correctness risk that is outside the current milestone.
