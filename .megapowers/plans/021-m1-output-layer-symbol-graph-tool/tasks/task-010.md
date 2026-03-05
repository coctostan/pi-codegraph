---
id: 10
title: formatNeighborhood shows omission counts when truncated
status: approved
depends_on:
  - 9
no_test: false
files_to_modify:
  - test/output-format-neighborhood.test.ts
files_to_create: []
---

**Spec criteria:** 17

**Files:**
- Test: `test/output-format-neighborhood.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-format-neighborhood.test.ts`:

```typescript
test("formatNeighborhood shows (N more omitted) when a category is truncated", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers = {
    items: [
      {
        anchor: { anchor: "src/b.ts:5:1234", stale: false } as AnchorResult,
        name: "caller1",
        edgeKind: "calls",
        confidence: 0.9,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 5,
  };

  const callees = { items: [], omitted: 0 };
  const imports = { items: [], omitted: 0 };
  const unresolved = { items: [], omitted: 0 };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved
  );

  expect(output).toContain("(5 more omitted)");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS — Task 9 implementation already renders `(N more omitted)`. This test explicitly covers spec criterion 17.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
