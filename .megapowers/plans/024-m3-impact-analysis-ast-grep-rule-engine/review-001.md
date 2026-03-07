---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 3
  - 2
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
approved_tasks:
  - 1
  - 3
needs_revision_tasks:
  - 2
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
---

### Task 1: Add pure impact traversal and classification — ✅ PASS
No blocking issues. The proposed `collectImpact()` uses existing `GraphStore` APIs (`findNodes`, `getNeighbors`) correctly, and the Bun test commands match the repo convention.

### Task 2: Add anchored impact output and register the impact tool — ❌ REVISE
- Step 2’s expected red is inaccurate. After Task 1, `src/tools/impact.ts` exists, so the first failure will be the missing named export `impact`, not the missing registration assertion.
- Step 3 self-imports from the file being edited: `import { collectImpact, type ChangeType } from "./impact.js";` inside `src/tools/impact.ts`. That is not a workable implementation plan.
- The task combines two behaviors in one test: output formatting and extension registration. Split into focused tests.

### Task 3: Index TSX files with the tree-sitter stage — ✅ PASS
No blocking issues. The task matches the current pipeline shape, uses the existing `indexProject()` / `extractFile()` flow, and the test runner commands are correct for this repo.

### Task 4: Load and validate bundled and project-local ast-grep rules — ❌ REVISE
- Step 3 parses `.yaml` files with `JSON.parse(...)`. That does not satisfy the YAML rule-file requirement.
- Step 1 writes JSON text into `.yaml` files, so the test would not prove YAML support even if the loader changed later.
- The task should use Bun’s built-in YAML parser and validate parsed YAML values, while preserving file-specific validation errors.

### Task 5: Add the sg subprocess scan wrapper — ❌ REVISE
- The proposed `SgMatch` shape does not match real `sg run --json` output. Real ast-grep JSON nests metavariables under `metaVariables.single` / `metaVariables.multi` and reports positions under `range.start`.
- `runScan()` lacks a `cwd` / `projectRoot` parameter. Later tasks pass relative file paths from `indexProject()`, so the subprocess plan will not work reliably without spawning in the project root.
- Because line/column normalization is wrong here, Tasks 6–9 inherit incorrect assumptions.

### Task 6: Create endpoint nodes and routes_to edges from Express matches — ❌ REVISE
- Step 3 violates AC 28. Endpoint node IDs must be exactly `endpoint:{METHOD}:{path}`, but the plan wraps them with `nodeId(file, name, 1)`, producing file-scoped IDs instead.
- The implementation assumes capture values already arrive in the simplified shape from Task 5; they do not.
- Real ast-grep string-literal captures include quotes, so the route path must be normalized before building `endpoint:GET:/users`.

### Task 7: Create renders edges from React matches with enclosing function lookup — ❌ REVISE
- Dependency annotations are inconsistent: frontmatter depends on Task 6, but the task header does not.
- Step 3 is not self-contained; it references an “existing express branch” instead of providing working code.
- The proposed cross-file fallback (`store.findNodes(targetName)[0]`) makes Task 9’s red phase disappear. Keep Task 7 scoped to same-file `from_context: enclosing_function` resolution.

### Task 8: Run the ast-grep stage from the pipeline and avoid duplicate unchanged edges — ❌ REVISE
- `runAstGrepIndexStage()` loads bundled rules from the wrong path (`process.cwd()` / `projectRoot + ..`), which is not a reliable way to locate `src/rules/`.
- The task does not incorporate the subprocess API fixes required by Task 5 (`projectRoot` / `cwd` aware scanning).
- The proposed helper `changedFiles()` in `ast-grep.ts` is dead/wrong; the pipeline already computes the changed-file list.

### Task 9: Index React renders from a real TSX fixture — ❌ REVISE
- As currently written, the task may not go red at all, because Task 7 already includes a global fallback lookup for the rendered component name.
- Step 3 is too vague to execute from the plan alone; it says to “ensure” behavior instead of specifying the concrete code change.
- This task should become the explicit cross-file fallback refinement once Task 7 is narrowed to same-file resolution.

### Task 10: Replace stale ast-grep edges when a changed file is re-indexed — ❌ REVISE
- The proposed implementation is incorrect. Calling `store.deleteFile(node.file)` from Stage 3 would delete freshly reindexed tree-sitter nodes and remove the file hash row, because `GraphStore` only exposes whole-file deletion and single-edge deletion.
- The expected red is also inaccurate with the current codebase: `indexProject()` already calls `store.deleteFile(rel)` before re-indexing a changed file, so stale same-file endpoint nodes/edges are already removed before Stage 3 runs.
- This task should be rewritten or merged into Task 8 as a regression test, not implemented with a new Stage 3 deletion helper.

### Missing Coverage
No acceptance-criteria gaps in the plan summary, but several tasks that nominally cover ACs 23–31 and 40–42 are not currently executable as written, so their coverage is not implementation-ready yet.

### Verdict
**revise** — Tasks 2 and 4–10 need adjustment for correctness and feasibility before implementation is safe.
