---
id: 3
title: readSourceSnippet — null end_line returns null
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - test/read-source-snippet.test.ts
files_to_create: []
---

### Task 3: readSourceSnippet — null end_line returns null [depends: 1]

**Files:**
- Modify: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**

Add to `test/read-source-snippet.test.ts`:

```typescript
test("readSourceSnippet returns null when end_line is null", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-nullend-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: null,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).toBeNull();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS — the `end_line == null` guard in Task 1 already handles this. This is a documentation test confirming AC 6.

**Step 3 — No additional implementation needed**

Already handled in Task 1.

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 377 tests passing
