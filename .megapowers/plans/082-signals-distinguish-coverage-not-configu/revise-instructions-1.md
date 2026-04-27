# Revise Instructions — iteration 1

## Root issue: TDD Step 5 will be RED on Tasks 4 and 5

Tasks 4 and 5 change `formatRoleTags` / `formatImpactWhy` globally. After either task lands, several existing tests (`test/output-signals.test.ts`, `test/tool-symbol-graph-signals.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-trace-signals.test.ts`, `test/extension-readonly-trust-gating.test.ts`) will FAIL because they construct stores manually (no coverage marked) and assert `untested` / `coverage:untested`. The current Task 4 Step 5 says "all passing" — that is wrong; the suite will be RED until Task 6 lands.

**Fix the ordering so every Step 5 is green.** The runtime order must become `1 → 2 → 3 → 6 → 4 → 5 → 7`.

Concretely:

## Task 6: Update existing signal tests to mark coverage indexed where they expect untested

Make this run BEFORE Tasks 4 and 5. Two changes:

1. **Change `depends_on` from `[1, 4, 5]` to `[1]`.** The fixture updates only need `markCoverageIndexed()` from Task 1; they do NOT depend on format changes.

2. **Reframe as `[no-test]` test-fixture preparation.** The current Step 1/2 ("run the suite first to see it fail") only works if Tasks 4/5 already landed. Since we're moving Task 6 earlier, restructure Task 6 like this:

   ```
   ### Task 6: ... [no-test]

   **Justification:** Pure test-fixture preparation. After this task, every fixture that
   manually builds a `SqliteGraphStore` and expects `untested` / `coverage:untested` in
   later assertions will explicitly mark coverage indexed. The change is a no-op against
   today's `formatRoleTags` / `formatImpactWhy` (they ignore `coverageKnown`), so the
   suite stays green; Tasks 4 and 5 then change the format functions and the suite
   remains green because these fixtures already have coverage marked. Verified by
   `bun test && bun run check`.

   **Files (all modify):**
   - `test/output-signals.test.ts`
   - `test/tool-symbol-graph-signals.test.ts`
   - `test/tool-impact-output-signals.test.ts`
   - `test/tool-trace-signals.test.ts`
   - `test/extension-readonly-trust-gating.test.ts`

   **Step 1 — Apply the change**
   In each file above, immediately after `const store = new SqliteGraphStore(...)`
   (and inside the same `try { ... }` block), add:
       store.markCoverageIndexed();
   Specifically:
   - `test/output-signals.test.ts` — after the `const store = new SqliteGraphStore();`
     near line 27.
   - `test/tool-symbol-graph-signals.test.ts` — after the `const store` near line 23.
   - `test/tool-impact-output-signals.test.ts` — after the `const store` near line 15.
   - `test/tool-trace-signals.test.ts` — after the `const store` near line 16.
   - `test/extension-readonly-trust-gating.test.ts` — inside `populateStore` after
     `const store = new SqliteGraphStore(dbPath);` near line 45.
   Do NOT modify any assertions.

   **Step 2 — Verify**
   Run: `bun test && bun run check`
   Expected: all passing.
   ```

3. **Drop `test/tool-impact-ranking.test.ts` from the file list.** `compareDetails` in
   `src/tools/impact.ts` only reads `signals.tested` (boolean), and both ranking-test
   expected orderings hold whether or not coverage is marked. Editing that file is
   unnecessary scope.

## Task 4: formatRoleTags renders coverage-unknown when coverage data is absent

1. **Change `depends_on` from `[3]` to `[3, 6]`.**
2. **Step 5 stays "Expected: all passing".** It is now actually true because Task 6 has
   already marked coverage in every existing fixture that asserts `untested`.

## Task 5: formatImpactWhy renders coverage:unknown when coverage data is absent

1. **Change `depends_on` from `[3]` to `[3, 6]` (or `[4]`).**
2. **Rewrite Step 5 to "Expected: all passing".** Remove the language saying existing
   tests "will FAIL because their fixtures construct stores manually... Task 6 updates
   those tests; do not chase them here yet." That language only made sense under the
   old ordering; under the new ordering Task 6 has already prepared the fixtures.

## Task 7: End-to-end regression

No code change required. Update `depends_on` from `[2, 4]` to `[2, 5]` so the dependency
chain reflects the new linear order (Task 5 is now the last format change before T7).

## Summary of dependency edges after revision

```
1
2  depends [1]
3  depends [1]
6  depends [1]            (no-test; fixture prep)
4  depends [3, 6]
5  depends [3, 6]         (or [4])
7  depends [2, 5]
```

Linear execution order: `1 → 2 → 3 → 6 → 4 → 5 → 7`. Every Step 5 ends green.
