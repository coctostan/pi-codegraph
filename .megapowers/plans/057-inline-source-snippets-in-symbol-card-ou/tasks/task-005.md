---
id: 5
title: readSourceSnippet — stale detection
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - test/read-source-snippet.test.ts
files_to_create: []
---

### Task 5: readSourceSnippet — stale detection [depends: 1]

**Files:**
- Modify: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**

Add to `test/read-source-snippet.test.ts`:

```typescript
test("readSourceSnippet sets stale=true when content hash mismatches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "old-stale-hash",
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).not.toBeNull();
    expect(result!.stale).toBe(true);
    // Should still contain the source
    expect(result!.text).toContain("export function foo()");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readSourceSnippet sets stale=false when content hash matches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-fresh-${Date.now()}`);
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
    end_line: 1,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).not.toBeNull();
    expect(result!.stale).toBe(false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS — stale detection is already in Task 1. This documents the stale behavior per AC 7.

**Step 3 — No additional implementation needed**

Already handled in Task 1.

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 380 tests passing
