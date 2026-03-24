---
id: 3
title: deleteEdge returns not-found when target symbol is missing
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - test/tool-delete-edge.test.ts
files_to_create: []
---

Covers: AC 3 (target not found returns message naming the symbol)

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge returns error when target symbol not found", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });

  const result = deleteEdge({
    source: "foo",
    target: "nonexistent",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("not found");
  expect(result).toContain("nonexistent");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-delete-edge.test.ts -t "target symbol not found"`
Expected: PASS — already handled by Task 1 implementation.

**Step 3 — Write minimal implementation**

No new code — `deleteEdge` already returns `Target symbol "${target}" not found`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
