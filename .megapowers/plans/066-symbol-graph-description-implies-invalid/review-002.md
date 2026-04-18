---
type: plan-review
iteration: 2
verdict: approve
reviewed_tasks:
  - 1
  - 2
approved_tasks:
  - 1
  - 2
needs_revision_tasks: []
---

### Task 1: Clarify the registered symbol_graph contract — ✅ PASS
No issues.

Coverage: Addresses Fixed When 1 and contributes to Fixed When 2/3 by updating the registered description and schema text. The task includes a concrete regression test in `test/extension-tool-descriptions.test.ts` for the stale top-level description and the generic `include` description.

Dependencies: Self-contained. The task uses the real `piCodegraph(pi: ExtensionAPI): void` entrypoint and the real `SymbolGraphParams` declaration from `src/index.ts`.

TDD correctness: Step 1 is runnable Bun test code. Step 2 names the actual first failure (`description mismatch for symbol_graph`). Step 3 uses the correct TypeBox APIs and the existing `registerReadOnlyTool`/`SymbolGraphParams` structure. Step 4/5 use the correct Bun commands for this repo.

Self-containment/codebase realism: Verified against `src/index.ts` and project conventions in `AGENTS.md` (`Bun runtime, TypeScript`). No fabricated APIs or paths.

### Task 2: Document valid symbol_graph include values in public docs — ✅ PASS
No issues.

Coverage: Addresses Fixed When 2 and 3 directly, and reinforces Fixed When 1 by checking the explicit allowed-value guidance. The task includes a regression test for the original bug shape by asserting that docs explicitly say `"tests"` is not a valid include value and no longer imply it through stale wording or examples.

Dependencies: Correctly depends on Task 1 for the updated wording. No forward references.

TDD correctness: Step 1 is full runnable Bun test code for `test/docs-symbol-graph-unified-surface.test.ts`. Step 2 names the actual first failure (`README is missing explicit symbol_graph include guidance`). Step 3 is now copy-pasteable and unambiguous: the README replacement block is syntactically valid, preserves the prior removed-section regression checks for `symbol_card`/`symbol_contract`, and updates `docs/tool-descriptions.md` with the approved wording. Step 4/5 use the correct Bun commands.

Granularity: One logical change across three files (`README.md`, `docs/tool-descriptions.md`, and one regression test), which is acceptable for a single documentation-surface task.

Self-containment/codebase realism: Verified file paths exist. The task’s test code uses a real import pattern already present in the repo (`readFileSync` from `node:fs`).

### Missing Coverage
None. Mechanically re-checked against `diagnosis.md` Fixed When criteria and `plan.md` coverage mapping:
1. Registered schema/docs enumerate valid include literals — covered by Tasks 1 and 2.
2. Docs distinguish default test signals from optional include sections and say `"tests"` is invalid — covered by Tasks 1 and 2.
3. Repo-owned docs and exact-string tests are updated together — covered by Tasks 1 and 2.

### Verdict
approve — plan is ready for implementation.
