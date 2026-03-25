---
id: 8
title: symbolCard — Source section shows "source unavailable" when end_line is null
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - test/tool-symbol-card-source.test.ts
files_to_create: []
---

### Task 8: symbolCard — Source section shows "source unavailable" when end_line is null [depends: 6]

**Files:**
- Modify: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

Add to `test/tool-symbol-card-source.test.ts`:

```typescript
test("symbolCard Source section shows 'source unavailable' when end_line is null", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-nullend-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: null,
      content_hash: hash,
      is_exported: true,
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Source");
    expect(output).toContain("source unavailable");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS — already handled by readSourceSnippet returning null. Documents AC 6.

**Step 3 — No additional implementation needed**

Already handled in Tasks 1 + 6.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 383 tests passing
