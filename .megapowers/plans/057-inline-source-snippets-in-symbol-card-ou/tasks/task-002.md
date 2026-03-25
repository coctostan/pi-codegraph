---
id: 2
title: readSourceSnippet — missing file returns null
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - test/read-source-snippet.test.ts
files_to_create: []
---

### Task 2: readSourceSnippet — missing file returns null [depends: 1]

**Files:**
- Modify: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**

Add to `test/read-source-snippet.test.ts`:

```typescript
test("readSourceSnippet returns null when file does not exist on disk", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-missing-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const node: GraphNode = {
    id: "src/gone.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/gone.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "abc123",
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
Expected: PASS — this case is already handled by the `!existsSync(fullPath)` check in Task 1. The test simply documents the behavior.

Note: this test passes immediately because the implementation from Task 1 already returns `null` for missing files. This is a documentation test confirming AC 5.

**Step 3 — No additional implementation needed**

Already handled in Task 1.

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 376 tests passing
