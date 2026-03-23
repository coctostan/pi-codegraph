---
id: 1
title: Refactor formatNeighborhood to accept named sections array
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/output/anchoring.ts
  - test/output-format-neighborhood.test.ts
files_to_create: []
---

**AC coverage:** AC 4 (formatNeighborhood accepts ordered named sections list)

**Files:**
- Modify: `src/output/anchoring.ts`
- Modify: `test/output-format-neighborhood.test.ts`

**Step 1 — Write the failing test**

Add to `test/output-format-neighborhood.test.ts`:

```typescript
test("formatNeighborhood accepts named sections array and renders them in order", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const sections = [
    {
      title: "Callers",
      section: {
        items: [
          {
            anchor: { anchor: "src/b.ts:5:1234", stale: false } as AnchorResult,
            name: "caller1",
            edgeKind: "calls",
            confidence: 0.9,
            provenanceSource: "tree-sitter",
          },
        ],
        omitted: 0,
      },
    },
    {
      title: "Extends",
      section: {
        items: [
          {
            anchor: { anchor: "src/c.ts:20:5678", stale: false } as AnchorResult,
            name: "BaseClass",
            edgeKind: "extends",
            confidence: 0.8,
            provenanceSource: "lsp",
          },
        ],
        omitted: 0,
      },
    },
  ];

  const output = formatNeighborhood(
    { name: "MyClass", kind: "class", anchor: symbolAnchor },
    sections,
  );

  expect(output).toContain("MyClass (class)");
  expect(output).toContain("### Callers");
  expect(output).toContain("caller1");
  expect(output).toContain("### Extends");
  expect(output).toContain("BaseClass");

  // Callers should appear before Extends (order preserved)
  const callersIdx = output.indexOf("### Callers");
  const extendsIdx = output.indexOf("### Extends");
  expect(callersIdx).toBeLessThan(extendsIdx);
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-format-neighborhood.test.ts`

Expected: FAIL — TypeError: sections.filter is not a function (or similar, because the current `formatNeighborhood` expects 4 positional params, not a sections array)

**Step 3 — Write minimal implementation**

In `src/output/anchoring.ts`, replace the `formatNeighborhood` function (lines 117-138) with:

```typescript
export interface NamedSection {
  title: string;
  section: NeighborSection;
}

export function formatNeighborhood(
  symbol: SymbolHeader,
  sections: NamedSection[],
): string {
  const staleMarker = symbol.anchor.stale ? " [stale]" : "";
  const signalTags = symbol.signals ? ` ${formatRoleTags(symbol.signals)}` : "";
  const header = `## ${symbol.name} (${symbol.kind})\n${symbol.anchor.anchor}${staleMarker}${signalTags}`;

  const renderedSections = sections
    .map((s) => formatSection(s.title, s.section))
    .filter((s) => s.length > 0)
    .join("\n");

  return `${header}${renderedSections}\n`;
}
```

Also export `NamedSection` from the imports at the top of `symbol-graph.ts` (this will be needed in Task 2).

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-format-neighborhood.test.ts`

Expected: PASS (the new test passes; existing tests will fail because they still use the old 4-param signature — we fix those next in this same task)

Update the 4 existing tests in `test/output-format-neighborhood.test.ts` to use the new array signature. For each existing test, wrap the callers/callees/imports/unresolved arguments into a `sections` array:

Replace every call like:
```typescript
formatNeighborhood(symbol, callers, callees, imports, unresolved)
```
with:
```typescript
formatNeighborhood(symbol, [
  { title: "Callers", section: callers },
  { title: "Callees", section: callees },
  { title: "Imports", section: imports },
  { title: "Unresolved", section: unresolved },
])
```

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: FAIL — `src/tools/symbol-graph.ts` still calls the old signature (fixed in Task 2). All `output-format-neighborhood` tests pass.
