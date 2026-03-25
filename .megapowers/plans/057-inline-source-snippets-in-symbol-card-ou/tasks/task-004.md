---
id: 4
title: readSourceSnippet — truncation with maxLines
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - test/read-source-snippet.test.ts
files_to_create: []
---

### Task 4: readSourceSnippet — truncation with maxLines [depends: 1]

**Files:**
- Modify: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**

Add to `test/read-source-snippet.test.ts`:

```typescript
test("readSourceSnippet truncates when source exceeds maxLines", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-trunc-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
  const fileContent = lines.join("\n") + "\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 20,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot, 5);
    expect(result).not.toBeNull();
    expect(result!.truncated).toBe(15);
    expect(result!.text).toContain("line 1");
    expect(result!.text).toContain("line 5");
    expect(result!.text).not.toContain("line 6");
    expect(result!.text).toContain("(15 more lines truncated)");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS — truncation logic is already in Task 1. This documents the truncation behavior per AC 3.

**Step 3 — No additional implementation needed**

Already handled in Task 1.

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 378 tests passing
