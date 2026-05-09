---
id: 5
title: Render neighborhood anchors with separate file context
status: approved
depends_on:
  - 2
  - 3
no_test: false
files_to_modify:
  - src/output/anchoring.ts
  - test/output-format-neighborhood.test.ts
  - test/tool-symbol-graph.test.ts
  - test/tool-symbol-graph-signals.test.ts
files_to_create: []
---

Covers AC 9 and part of AC 15.

**Files:**
- Modify: `src/output/anchoring.ts`
- Modify: `test/output-format-neighborhood.test.ts`
- Modify: `test/tool-symbol-graph.test.ts`
- Modify: `test/tool-symbol-graph-signals.test.ts`

**Step 1 — Write the failing test**
Update `test/output-format-neighborhood.test.ts` so AnchorResult fixtures include `file` and the output assertions require separate file context:

```ts
import { expect, test } from "bun:test";
import { formatAnchorLocation, formatNeighborhood } from "../src/output/anchoring.js";
import type { AnchorResult } from "../src/output/anchoring.js";

test("formatAnchorLocation renders file path separately from bare editable anchor", () => {
  const anchor: AnchorResult = { file: "src/a.ts", anchor: "10:abc", stale: false };

  expect(formatAnchorLocation(anchor)).toBe("src/a.ts  10:abc");
  expect(formatAnchorLocation(anchor)).not.toContain("src/a.ts:10:");
});

test("formatNeighborhood renders header and neighbor rows with file-separated anchors", () => {
  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: { file: "src/a.ts", anchor: "10:abc", stale: false } },
    [
      {
        title: "Callers",
        section: {
          items: [
            {
              anchor: { file: "src/b.ts", anchor: "5:123", stale: false },
              name: "caller1",
              edgeKind: "calls",
              confidence: 0.9,
              provenanceSource: "tree-sitter",
            },
          ],
          omitted: 0,
        },
      },
    ],
  );

  expect(output).toContain("## myFunc (function)");

Update existing symbol graph neighborhood assertions in `test/tool-symbol-graph.test.ts` and `test/tool-symbol-graph-signals.test.ts` in the same task. Replace old assertions such as:

```ts
expect(output).toContain("src/a.ts:3:");
expect(out).toMatch(/src\/shared\.ts:1:[0-9a-f]{4} \[entry-point, tested\]/);
```

with file-separated 3-hex assertions:

```ts
expect(output).toMatch(/src\/a\.ts  3:[0-9a-f]{3}/);
expect(out).toMatch(/src\/shared\.ts  1:[0-9a-f]{3} \[entry-point, tested\]/);
expect(output).not.toMatch(/src\/a\.ts:3:[0-9a-f]{4}/);
```
  expect(output).toContain("src/a.ts  10:abc");
  expect(output).toContain("src/b.ts  5:123  caller1  calls");
  expect(output).not.toContain("src/a.ts:10:");
  expect(output).not.toContain("src/b.ts:5:");
});
```

Keep the existing omission, stale-marker, unresolved, and ordering tests, but update their `AnchorResult` fixtures to include `file` and 3-character bare anchors.

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: FAIL — `SyntaxError: Export named 'formatAnchorLocation' not found in module '../src/output/anchoring.js'.`

**Step 3 — Write minimal implementation**
In `src/output/anchoring.ts`, add:

```ts
export function formatAnchorLocation(anchor: AnchorResult): string {
  return `${anchor.file}  ${anchor.anchor}`;
}
```

Update `formatSection` and `formatNeighborhood` to use it:

```ts
function formatSection(title: string, section: NeighborSection): string {
  if (section.items.length === 0 && section.omitted === 0) return "";

  const lines: string[] = [];
  lines.push(`\n### ${title}`);

  for (const item of section.items) {
    const staleMarker = item.anchor.stale ? " [stale]" : "";
    const signalTags = item.signals ? ` ${formatRoleTags(item.signals)}` : "";
    lines.push(
      `  ${formatAnchorLocation(item.anchor)}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}${signalTags}`,
    );
  }

  if (section.omitted > 0) lines.push(`  (${section.omitted} more omitted)`);
  return lines.join("\n");
}

export function formatNeighborhood(symbol: SymbolHeader, sections: NamedSection[]): string {
  const staleMarker = symbol.anchor.stale ? " [stale]" : "";
  const signalTags = symbol.signals ? ` ${formatRoleTags(symbol.signals)}` : "";
  const header = `## ${symbol.name} (${symbol.kind})\n${formatAnchorLocation(symbol.anchor)}${staleMarker}${signalTags}`;
  const renderedSections = sections
    .map((s) => formatSection(s.title, s.section))
    .filter((s) => s.length > 0)
    .join("\n");
  return `${header}${renderedSections}\n`;
}
```

Also replace all existing old-shape neighborhood assertions in `test/tool-symbol-graph.test.ts` and `test/tool-symbol-graph-signals.test.ts` so `bun test` passes at this task's Step 5.

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
