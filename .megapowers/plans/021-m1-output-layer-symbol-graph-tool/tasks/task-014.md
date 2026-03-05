---
id: 14
title: symbolGraph returns not found message for unknown symbol
status: approved
depends_on:
  - 13
no_test: false
files_to_modify:
  - test/tool-symbol-graph.test.ts
files_to_create: []
---

**Spec criteria:** 22

**Files:**
- Test: `test/tool-symbol-graph.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-symbol-graph.test.ts`:

```typescript
test("symbolGraph returns not found message for unknown symbol", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();

    const output = symbolGraph({ name: "doesNotExist", store, projectRoot });

    expect(output).toContain("not found");
    expect(output).toContain("doesNotExist");

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS — Task 13 implementation already handles zero matches. This test covers spec criterion 22.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
