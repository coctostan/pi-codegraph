---
id: 9
title: formatNeighborhood produces header and neighbor sections
status: approved
depends_on:
  - 3
  - 6
no_test: false
files_to_modify:
  - src/output/anchoring.ts
files_to_create:
  - test/output-format-neighborhood.test.ts
---

**Spec criteria:** 14, 15, 16, 18

**Files:**
- Modify: `src/output/anchoring.ts`
- Create: `test/output-format-neighborhood.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/output-format-neighborhood.test.ts
import { expect, test } from "bun:test";
import { formatNeighborhood } from "../src/output/anchoring.js";
import type { AnchorResult } from "../src/output/anchoring.js";

interface AnchoredNeighbor {
  anchor: AnchorResult;
  name: string;
  edgeKind: string;
  confidence: number;
  provenanceSource: string;
}

test("formatNeighborhood produces header and populated sections, omits empty ones", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [
      {
        anchor: { anchor: "src/b.ts:5:1234", stale: false },
        name: "caller1",
        edgeKind: "calls",
        confidence: 0.9,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  const callees: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [
      {
        anchor: { anchor: "src/c.ts:20:5678", stale: false },
        name: "callee1",
        edgeKind: "calls",
        confidence: 0.5,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  // Empty imports — should be omitted from output
  const imports: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [],
    omitted: 0,
  };

  const unresolved: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [],
    omitted: 0,
  };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved
  );

  // Has header
  expect(output).toContain("myFunc (function)");
  expect(output).toContain("src/a.ts:10:abcd");

  // Has callers section
  expect(output).toContain("Callers");
  expect(output).toContain("src/b.ts:5:1234");
  expect(output).toContain("caller1");
  expect(output).toContain("0.9");
  expect(output).toContain("tree-sitter");

  // Has callees section
  expect(output).toContain("Callees");
  expect(output).toContain("src/c.ts:20:5678");
  expect(output).toContain("callee1");

  // No imports section (empty)
  expect(output).not.toContain("Imports");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: FAIL — TypeError: formatNeighborhood is not a function (or import error)

**Step 3 — Write minimal implementation**

Add to `src/output/anchoring.ts`:

```typescript
export interface AnchoredNeighbor {
  anchor: AnchorResult;
  name: string;
  edgeKind: string;
  confidence: number;
  provenanceSource: string;
}

export interface NeighborSection {
  items: AnchoredNeighbor[];
  omitted: number;
}

export interface SymbolHeader {
  name: string;
  kind: string;
  anchor: AnchorResult;
}

function formatSection(title: string, section: NeighborSection): string {
  if (section.items.length === 0 && section.omitted === 0) return "";

  const lines: string[] = [];
  lines.push(`\n### ${title}`);

  for (const item of section.items) {
    const staleMarker = item.anchor.stale ? " [stale]" : "";
    lines.push(
      `  ${item.anchor.anchor}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}`
    );
  }

  if (section.omitted > 0) {
    lines.push(`  (${section.omitted} more omitted)`);
  }

  return lines.join("\n");
}

export function formatNeighborhood(
  symbol: SymbolHeader,
  callers: NeighborSection,
  callees: NeighborSection,
  imports: NeighborSection,
  unresolved: NeighborSection
): string {
  const staleMarker = symbol.anchor.stale ? " [stale]" : "";
  const header = `## ${symbol.name} (${symbol.kind})\n${symbol.anchor.anchor}${staleMarker}`;

  const sections = [
    formatSection("Callers", callers),
    formatSection("Callees", callees),
    formatSection("Imports", imports),
    formatSection("Unresolved", unresolved),
  ]
    .filter((s) => s.length > 0)
    .join("\n");

  return `${header}${sections}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
