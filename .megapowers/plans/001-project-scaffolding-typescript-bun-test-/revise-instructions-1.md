## Task 1: Project config files: package.json and tsconfig.json

This task needs structural fixes and config correctness fixes.

1) Convert the task to the required `[no-test]` 2-step format.
- Current task has 3 steps and says `bun run check` is expected to fail. No-test tasks must have a clear verification step with expected success.

2) Fix `tsconfig.json` so `bun run check` can pass once tests exist.
- Current config sets:
  - `"rootDir": "src"`
  - `"include": ["src/**/*.ts", "test/**/*.ts"]`
- This combination causes TS6059 when `test/` files are present (`test` is outside rootDir).
- Replace with one of these valid options:
  - remove `rootDir` entirely, or
  - set `"rootDir": "."`

3) Align Bun type configuration.
- Current task installs `@types/bun` but sets `"types": ["bun-types"]`.
- Use a consistent pair:
  - If using `@types/bun`, set `"types": ["bun"]`.
  - If using `bun-types`, install `bun-types` and keep `"types": ["bun-types"]`.
- Pick one and keep it consistent in both package.json and tsconfig.

4) Add explicit AC mapping in the task description.
- Task should state it covers AC 1, AC 2, AC 3.

---

## Task 2: All stub modules and directory structure

This task violates granularity and one acceptance criterion name.

1) Split this task into multiple bite-sized tasks.
- Current task touches 10 files and bundles unrelated outputs.
- Quality bar requires one logical change per task and <=3 files per task.
- Suggested split:
  - task for `src/index.ts`
  - task for `src/graph/types.ts`
  - task for `src/graph/store.ts` + `src/graph/sqlite.ts`
  - task for `src/indexer/pipeline.ts` + `src/indexer/tree-sitter.ts`
  - task for `src/tools/symbol-graph.ts` + `src/tools/resolve-edge.ts`
  - task for `src/output/anchoring.ts` + `src/rules/.gitkeep`

2) Fix export name for AC 8.
- Spec requires placeholder `IndexPipeline` function (capital I).
- Current task exports `indexPipeline` (lowercase).
- Change to:
```ts
export function IndexPipeline(): void {}
```
(or revise spec if lowercase is intended, but currently spec is uppercase).

3) Keep this task (or its split children) either fully test-driven or valid no-test.
- If no-test, each split task must include a concrete verification command (e.g., `bun run check`).
- Prefer test-driven tasks for files with observable exports.

4) Add explicit AC mapping for each split task.

---

## Task 3: Smoke test and import verification

This task has major TDD-completeness and determinism issues.

1) Step 2 must have a deterministic failure expectation.
- Current text is conditional: “If Task 2 isn’t done... If Task 2 is done...”
- Replace with a single specific expected failure message.
- Example pattern:
  - Run: `bun test test/smoke.test.ts`
  - Expected: `FAIL — error: Cannot find module "../src/index.js"`

2) Step 3 must contain full implementation code, not prose.
- Current Step 3 says “No new implementation needed...”.
- Non-`[no-test]` tasks require copy-pasteable implementation code in Step 3.

3) Split this task into smaller one-test/one-implementation tasks.
- Current Step 1 defines 10 tests across many modules in one task.
- This violates granularity (“one test + one implementation”).
- Create separate tasks so each task validates one module export (or one closely related pair).

4) Fix type-export validation approach.
- Current test destructures `GraphNode`, `GraphEdge`, `Provenance` from runtime import, but interfaces do not exist at runtime.
- For AC 5, validate via type-check-only test file pattern, e.g.:
```ts
import type { GraphNode, GraphEdge, Provenance } from "../src/graph/types.js";

const _node: GraphNode = { id: "n", kind: "function", name: "f", file: "a.ts", line: 1 };
const _edge: GraphEdge = { source: "n1", target: "n2", kind: "calls" };
const _prov: Provenance = { source: "tree-sitter", confidence: 0.5 };

void [_node, _edge, _prov];
```
Then verify with `bun run check`.

5) Add explicit AC mapping for each new split task.

---

## Plan-wide changes required

1) Rework plan to satisfy quality bar:
- Every non-no-test task: 5 steps with concrete failing message and concrete implementation code.
- Every task: <=3 files and one logical change.
- Explicit `depends_on` for split tasks.

2) Ensure every AC is clearly mapped.
- Add a line in each task description like: `Covers: AC 4, AC 16`.

3) Keep full-suite verification consistent.
- Use `bun test` for Step 5 in test tasks.
- Use `bun run check` where type checks are required for AC 15.
