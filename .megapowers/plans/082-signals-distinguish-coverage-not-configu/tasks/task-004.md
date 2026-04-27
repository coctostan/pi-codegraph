---
id: 4
title: Mark coverage indexed in existing manual-store fixtures (test prep)
status: approved
depends_on:
  - 1
no_test: true
files_to_modify:
  - test/output-signals.test.ts
  - test/tool-symbol-graph-signals.test.ts
  - test/tool-impact-output-signals.test.ts
  - test/tool-trace-signals.test.ts
  - test/extension-readonly-trust-gating.test.ts
files_to_create: []
---

[no-test] Test-fixture preparation. Runs BEFORE the format-function changes (Tasks 5 and 6) so the suite stays green when those format functions change.

**Justification:** Pure test-fixture preparation. After this task, every fixture that manually builds a `SqliteGraphStore` and asserts `untested` / `coverage:untested` in later tests will explicitly call `store.markCoverageIndexed()` (added in Task 1). This is a no-op against today's `formatRoleTags` / `formatImpactWhy` (they ignore `coverageKnown`), so the suite stays green here. Tasks 5 and 6 then change the format functions, and the suite stays green because these fixtures already have coverage marked. `tool-impact-ranking.test.ts` is intentionally NOT in the list: its `compareDetails` reads only `signals.tested` (boolean), so the ordering assertions hold regardless of `coverageKnown`.

**Files (all modify):**
- `test/output-signals.test.ts`
- `test/tool-symbol-graph-signals.test.ts`
- `test/tool-impact-output-signals.test.ts`
- `test/tool-trace-signals.test.ts`
- `test/extension-readonly-trust-gating.test.ts`

**Step 1 — Apply the change**

In each file below, immediately after `const store = new SqliteGraphStore(...)` and inside the same `try { ... }` block (before any nodes/edges are added), add:

```ts
    store.markCoverageIndexed();
```

Specific insertion sites:

1. `test/output-signals.test.ts` — after `const store = new SqliteGraphStore();` near line 27 (inside `"createSignalComputer computes AC-aligned ..."`).
2. `test/tool-symbol-graph-signals.test.ts` — after `const store = new SqliteGraphStore();` near line 23.
3. `test/tool-impact-output-signals.test.ts` — after `const store = new SqliteGraphStore();` near line 15.
4. `test/tool-trace-signals.test.ts` — after `const store = new SqliteGraphStore();` near line 16.
5. `test/extension-readonly-trust-gating.test.ts` — inside `populateStore`, after `const store = new SqliteGraphStore(dbPath);` near line 45 (before the existing `extractFile` call).

Do NOT modify any assertions or any other lines.

**Step 2 — Verify**

Run: `bun test && bun run check`
Expected: all passing. No assertions changed; `coverageKnown` is recorded on each store but the existing format functions still ignore it. Fixtures are now ready for Tasks 5 and 6.
