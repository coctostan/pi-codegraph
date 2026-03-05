---
id: 11
title: formatNeighborhood suffixes stale entries with [stale]
status: approved
depends_on:
  - 9
no_test: false
files_to_modify:
  - test/output-format-neighborhood.test.ts
files_to_create: []
---

**Spec criteria:** 19

**Files:**
- Test: `test/output-format-neighborhood.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-format-neighborhood.test.ts`:

```typescript
test("formatNeighborhood suffixes stale entries with [stale]", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers = {
    items: [
      {
        anchor: { anchor: "src/b.ts:5:1234", stale: true } as AnchorResult,
        name: "staleCaller",
        edgeKind: "calls",
        confidence: 0.9,
        provenanceSource: "tree-sitter",
      },
      {
        anchor: { anchor: "src/c.ts:8:5678", stale: false } as AnchorResult,
        name: "freshCaller",
        edgeKind: "calls",
        confidence: 0.8,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
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

  // Stale entry has [stale] marker
  const staleCallerLine = output.split("\n").find((l) => l.includes("staleCaller"));
  expect(staleCallerLine).toContain("[stale]");

  // Fresh entry does not
  const freshCallerLine = output.split("\n").find((l) => l.includes("freshCaller"));
  expect(freshCallerLine).not.toContain("[stale]");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS — Task 9 implementation already appends `[stale]` when `item.anchor.stale` is true. This test explicitly covers spec criterion 19.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
