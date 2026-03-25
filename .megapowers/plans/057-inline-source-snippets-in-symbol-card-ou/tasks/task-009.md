---
id: 9
title: symbolCard — Source section shows [stale] marker on hash mismatch
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - test/tool-symbol-card-source.test.ts
files_to_create: []
---

### Task 9: symbolCard — Source section shows [stale] marker on hash mismatch [depends: 6]

**Files:**
- Modify: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

Add to `test/tool-symbol-card-source.test.ts`:

```typescript
test("symbolCard Source section header includes [stale] when content hash mismatches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "old-stale-hash",
      is_exported: true,
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Source [stale]");
    // Source content should still be present
    expect(output).toContain("export function foo()");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS — already handled by the `snippet.stale` check in Task 6. Documents AC 7.

**Step 3 — No additional implementation needed**

Already handled in Task 6.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 384 tests passing
