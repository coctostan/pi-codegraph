---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 2
  - 5
  - 8
  - 1
  - 3
  - 4
  - 6
  - 7
approved_tasks:
  - 2
  - 5
  - 8
needs_revision_tasks:
  - 1
  - 3
  - 4
  - 6
  - 7
---


## Summary

The strategic direction from iteration 1 is correct — renderer shape is right, Task 5 is now a real docs-drift RED state, AC 19 is covered by extending the Task 3 / Task 4 tests, and AC 21 has a concrete artifact path. **However, multiple task files suffered silent content loss during the revise edits**, making their Step 1 tests and Step 3 implementations non-compilable as currently written. In addition, `plan.md` lost numbered bullets for tasks 1, 3, and 4 in the task list.

Detailed per-task instructions with the full restored code blocks are in `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/revise-instructions-2.md`.

## Per-task verdicts

### Task 1: Extract shared compact card renderer — ❌ REVISE
Step 1 test is missing `const fileAContent` and `const store = new SqliteGraphStore();`. Step 3 impl is missing the `if (nodes.length === 0) {` opening brace, the `const tests = ...` filter line, the `const relSections: string[] = [];` declaration, the `if (relSections.length > 0) {` opening brace, and the `return {` brace. Ninjas ate entire lines.

### Task 2: Extract shared legacy neighborhood renderer — ✅ PASS
Unchanged and intact.

### Task 3: Make symbol_graph default to compact card — ❌ REVISE
Step 1 test is missing the `test("…", () => {` wrapper, `const fileAContent`, the `store.addNode({ id: "src/a.ts::foo:3", … })` line, the `expect(withoutInclude).toBe(withEmptyInclude);` assertion (AC 4 goes missing without it), and the `expect(symbolGraph({ name: "doesNotExist", …})).toContain(...)` line. Step 3 impl is missing the `export interface SymbolGraphParams {` opening and `const useNeighborhoodBase = ...;`.

Additionally, the Task 3 / Task 4 schema-broadening ordering is still fuzzy — Task 3 pushes `include: ["neighborhood"]` into the registered tool's execute path before Task 4 broadens the schema. If the pi runtime does any `Value.Check` on parameters pre-execute, this is red mid-sequence. Pick one: move the schema edit into Task 3, or document an atomic Task-3+Task-4 commit during implement.

### Task 4: Validate include values — ❌ REVISE
Step 1 test is missing the outer `test(...)` wrapper for the schema test, `resetStoreForTesting();`, `const tool = tools.find(...)`, `const schema = tool.parameters as any;`, `const store = new SqliteGraphStore();` in the second test, the `store.addNode({ id: "src/a.ts::foo:3", … })` row, **and the `expect(neighborhood).toBe(expected)` byte-identity assertion** (this is the whole point of AC 10).

### Task 5: Docs drift + docs updates — ✅ PASS
Test body is complete, RED state is real (README currently contains `symbol_card` subsections), docs update instructions are clear.

### Task 6: Append source sections — ❌ REVISE
Step 1 is missing `const store = new SqliteGraphStore();` inside `setupSourceFixture()` (so the whole fixture is broken), and the `expect(withSource.startsWith(base))`/`startsWith(neighborhoodBody)`/`expect(contractIdx).toBeGreaterThan(-1)` assertions. Step 3 impl is missing the `if ((include ?? []).includes("source")) {` opening brace in `src/tools/symbol-graph.ts`.

### Task 7: Remove standalone registrations — ❌ REVISE
Step 3's numbered list starts at `2.` — item `1. Remove the symbolCard and symbolContract imports.` was dropped. Implementer would leave dead imports and TS would error on unused imports.

### Task 8: AC 21 audit artifact — ✅ PASS
Concrete path, explicit content, real verification via `test -f` + `grep -q` + `bun run check`. Good.

## plan.md — ❌ REVISE

`## Task list` lost the `1. **…**`, `3. **…**`, `4. **…**` leading lines — only indented `Detailed task: ...` lines remain for those. Restore the numbered-bold task titles so the list renders properly.

## Missing Coverage

No new coverage gaps introduced by this iteration. Once the code blocks are restored, coverage of AC 1–23 is intact as described in the `## Coverage check` section (which itself is fine).

## Verdict

**revise** — approved_tasks = [2, 5, 8]; needs_revision_tasks = [1, 3, 4, 6, 7]. Follow `revise-instructions-2.md` — replace the Step 1 / Step 3 code blocks in the five failing tasks with the complete versions provided there, resolve the Task 3 / Task 4 schema-ordering question explicitly, and rebuild the `## Task list` section in `plan.md`.

