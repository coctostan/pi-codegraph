---
id: 5
title: computeAnchor returns stale with ? hash when file missing
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - test/output-compute-anchor.test.ts
files_to_create: []
---

**Spec criteria:** 8

**Files:**
- Test: `test/output-compute-anchor.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-compute-anchor.test.ts`:

```typescript
test("computeAnchor returns stale=true with ? hash when file does not exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-missing-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const node = {
    id: "src/gone.ts::foo:5",
    kind: "function" as const,
    name: "foo",
    file: "src/gone.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "doesnotmatter",
  };

  const result = computeAnchor(node, projectRoot);

  expect(result.anchor).toBe("src/gone.ts:5:?");
  expect(result.stale).toBe(true);

  rmSync(projectRoot, { recursive: true, force: true });
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS — This should already pass since Task 3 implementation handles missing files with `existsSync` check. This test explicitly covers spec criterion 8.

**Step 3 — No additional implementation needed**

The `computeAnchor` from Task 3 already checks `existsSync(fullPath)` and returns `{ anchor: "file:line:?", stale: true }`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
