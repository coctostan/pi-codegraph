---
id: 4
title: computeAnchor marks stale when file content changed
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - test/output-compute-anchor.test.ts
files_to_create: []
---

**Spec criteria:** 7

**Files:**
- Test: `test/output-compute-anchor.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-compute-anchor.test.ts`:

```typescript
test("computeAnchor returns stale=true when file content hash differs from node", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const originalContent = "line one\nexport function foo() {}\nline three";
  const modifiedContent = "line one\nexport function foo() { return 1; }\nline three";
  const filePath = "src/a.ts";

  // Write the modified file but use hash of original
  writeFileSync(join(projectRoot, filePath), modifiedContent);

  const node = {
    id: "src/a.ts::foo:2",
    kind: "function" as const,
    name: "foo",
    file: filePath,
    start_line: 2,
    end_line: 2,
    content_hash: sha256Hex(originalContent), // hash of original, not current
  };

  const result = computeAnchor(node, projectRoot);

  // Still produces an anchor from the current file content
  const currentLine = "export function foo() { return 1; }";
  const expectedLineHash = sha256Hex(currentLine.trim()).slice(0, 4);
  expect(result.anchor).toBe(`src/a.ts:2:${expectedLineHash}`);
  expect(result.stale).toBe(true);

  rmSync(projectRoot, { recursive: true, force: true });
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS — This should already pass since Task 3 implementation handles stale detection. This test explicitly covers spec criterion 7 (stale=true with best-effort anchor).

**Step 3 — No additional implementation needed**

The `computeAnchor` from Task 3 already compares `currentHash !== node.content_hash` and still produces a valid anchor from the current file.

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
