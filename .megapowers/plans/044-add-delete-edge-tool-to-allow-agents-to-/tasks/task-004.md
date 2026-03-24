---
id: 4
title: deleteEdge returns disambiguation list for ambiguous source
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - test/tool-delete-edge.test.ts
files_to_create: []
---

Covers: AC 4 (ambiguous source returns disambiguation list)

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge returns disambiguation list when source has multiple matches", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::foo:5", kind: "class", name: "foo", file: "src/b.ts", start_line: 5, end_line: 10, content_hash: "h2" });
  store.addNode({ id: "src/a.ts::bar:10", kind: "function", name: "bar", file: "src/a.ts", start_line: 10, end_line: 12, content_hash: "h1" });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Ambiguous source");
  expect(result).toContain("src/a.ts");
  expect(result).toContain("src/b.ts");
  expect(result).toContain("function");
  expect(result).toContain("class");
  expect(result).toContain("line 1");
  expect(result).toContain("line 5");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-delete-edge.test.ts -t "disambiguation list when source"`
Expected: PASS — already handled by Task 1 implementation.

**Step 3 — Write minimal implementation**

No new code — `deleteEdge` already calls `formatDisambiguation("source", sourceNodes)`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
