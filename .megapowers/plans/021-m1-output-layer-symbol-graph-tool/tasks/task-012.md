---
id: 12
title: formatNeighborhood shows unresolved section for __unresolved__ nodes
status: approved
depends_on:
  - 9
no_test: false
files_to_modify:
  - test/output-format-neighborhood.test.ts
files_to_create: []
---

**Spec criteria:** 20

**Files:**
- Test: `test/output-format-neighborhood.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-format-neighborhood.test.ts`:

```typescript
test("formatNeighborhood shows Unresolved section for __unresolved__ nodes", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers = { items: [], omitted: 0 };
  const callees = { items: [], omitted: 0 };
  const imports = { items: [], omitted: 0 };

  const unresolved = {
    items: [
      {
        anchor: { anchor: "__unresolved__::Parser:0:?", stale: true } as AnchorResult,
        name: "Parser",
        edgeKind: "calls",
        confidence: 0.5,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved
  );

  expect(output).toContain("Unresolved");
  expect(output).toContain("Parser");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS — Task 9 implementation handles the unresolved section via `formatSection("Unresolved", unresolved)`. This test covers spec criterion 20.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
