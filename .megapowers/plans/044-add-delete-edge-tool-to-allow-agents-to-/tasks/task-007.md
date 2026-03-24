---
id: 7
title: deleteEdge returns not-found when no matching agent edge exists
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - test/tool-delete-edge.test.ts
files_to_create: []
---

Covers: AC 6 (no matching agent edge returns "not found")

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge returns not-found when no agent edge exists between symbols", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  // No edge exists at all
  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("No agent edge found");
  expect(result).toContain("foo");
  expect(result).toContain("bar");
  expect(result).toContain("calls");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-delete-edge.test.ts -t "no agent edge exists"`
Expected: PASS — already handled by Task 1 implementation.

**Step 3 — Write minimal implementation**

No new code — `deleteEdge` already checks for agent edge via `getNeighbors` and returns the not-found message.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
