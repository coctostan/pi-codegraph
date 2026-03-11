---
id: 12
title: Update existing pipeline tests for new IndexResult shape
status: approved
depends_on:
  - 11
no_test: false
files_to_modify:
  - test/indexer-index-project.test.ts
files_to_create: []
---

**AC:** 15 (summary counts preserved), 19 (regression safety)

**Files:**
- Modify: `test/indexer-index-project.test.ts`

This task updates all existing tests that use strict `toEqual` on `indexProject` return values to use `toMatchObject`, accommodating the new `timings` field.

**Step 1 — Write the failing test**

No new test. The existing tests _are_ the failing tests after Task 11 changes `IndexResult`.

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-index-project.test.ts`
Expected: FAIL — `Expected: {"errors": 0, "indexed": 2, "removed": 0, "skipped": 0}, Received: {"errors": 0, "indexed": 2, "removed": 0, "skipped": 0, "timings": {...}}`

**Step 3 — Write minimal implementation**

In `test/indexer-index-project.test.ts`, change 6 strict `toEqual` calls to `toMatchObject`:

Line 41:
```ts
// Before:
expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
// After:
expect(result).toMatchObject({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
```

Line 86:
```ts
// Before:
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
// After:
await expect(indexProject(root, store)).resolves.toMatchObject({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
```

Line 91:
```ts
// Before:
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 0, skipped: 1, removed: 1, errors: 1 });
// After:
await expect(indexProject(root, store)).resolves.toMatchObject({ indexed: 0, skipped: 1, removed: 1, errors: 1 });
```

Line 131:
```ts
// Before:
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
// After:
await expect(indexProject(root, store)).resolves.toMatchObject({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
```

Line 146:
```ts
// Before:
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
// After:
await expect(indexProject(root, store)).resolves.toMatchObject({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
```

Lines 243-248:
```ts
// Before:
await expect(indexProject(root, store, { lspClientFactory: () => fakeClient })).resolves.toEqual({
  indexed: 1, skipped: 0, removed: 0, errors: 0,
});
// After:
await expect(indexProject(root, store, { lspClientFactory: () => fakeClient })).resolves.toMatchObject({
  indexed: 1, skipped: 0, removed: 0, errors: 0,
});
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-index-project.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
