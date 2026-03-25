---
id: 7
title: symbolCard — Source section shows "source unavailable" when file missing
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - test/tool-symbol-card-source.test.ts
files_to_create: []
---

### Task 7: symbolCard — Source section shows "source unavailable" when file missing [depends: 6]

**Files:**
- Modify: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

Add to `test/tool-symbol-card-source.test.ts`:

```typescript
test("symbolCard Source section shows 'source unavailable' when file does not exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-missing-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/gone.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/gone.ts",
      start_line: 1,
      end_line: 5,
      content_hash: "abc123",
      is_exported: true,
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Source");
    expect(output).toContain("source unavailable");
    // Should NOT crash or have empty section
    expect(output).toContain("### Signature");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS — already handled by the null check in Task 6. Documents AC 5.

**Step 3 — No additional implementation needed**

Already handled in Task 6.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 382 tests passing
