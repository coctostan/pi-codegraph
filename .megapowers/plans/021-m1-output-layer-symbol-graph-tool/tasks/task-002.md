---
id: 2
title: findNodes filters by file when provided
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - test/graph-store-find-nodes.test.ts
files_to_create: []
---

**Spec criteria:** 3

**Files:**
- Test: `test/graph-store-find-nodes.test.ts`

**Step 1 — Write the failing test**

Append to `test/graph-store-find-nodes.test.ts`:

```typescript
test("findNodes filters by file when file parameter is provided", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });

  store.addNode({
    id: "src/b.ts::foo:5",
    kind: "function",
    name: "foo",
    file: "src/b.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
  });

  const results = store.findNodes("foo", "src/a.ts");
  expect(results).toHaveLength(1);
  expect(results[0]!.id).toBe("src/a.ts::foo:1");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-find-nodes.test.ts`
Expected: PASS — This test should already pass because the `findNodes` implementation from Task 1 already handles the `file` parameter. This test documents and verifies criterion 3.

**Step 3 — No additional implementation needed**

The `findNodes` implementation from Task 1 already includes the `AND file = ?` conditional. This test exists to explicitly cover spec criterion 3.

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-find-nodes.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
