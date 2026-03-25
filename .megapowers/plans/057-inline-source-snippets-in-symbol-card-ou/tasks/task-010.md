---
id: 10
title: symbolCard — maxSourceLines truncates source output
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - test/tool-symbol-card-source.test.ts
files_to_create: []
---

### Task 10: symbolCard — maxSourceLines truncates source output [depends: 6]

**Files:**
- Modify: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

Add to `test/tool-symbol-card-source.test.ts`:

```typescript
test("symbolCard truncates source when maxSourceLines is provided", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-max-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const lines = Array.from({ length: 20 }, (_, i) => `  statement_${i + 1};`);
  const fileContent = `function bigFn() {\n${lines.join("\n")}\n}\n`;
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::bigFn:1",
      kind: "function",
      name: "bigFn",
      file: "src/a.ts",
      start_line: 1,
      end_line: 22,
      content_hash: hash,
      is_exported: true,
    });

    const output = symbolCard({ name: "bigFn", store, projectRoot, maxSourceLines: 3 });

    expect(output).toContain("### Source");
    // Should contain first 3 lines
    expect(output).toContain("function bigFn()");
    expect(output).toContain("statement_1");
    expect(output).toContain("statement_2");
    // Should NOT contain line 4+
    expect(output).not.toContain("statement_3");
    // Should show truncation indicator
    expect(output).toContain("more lines truncated)");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS — `maxSourceLines` is already wired in Task 6. Documents AC 3 and AC 12.

**Step 3 — No additional implementation needed**

Already handled in Tasks 1 + 6.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 385 tests passing
