---
id: 2
title: Map coverage ranges to graph nodes
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/coverage.ts
files_to_create:
  - test/indexer-coverage-mapping.test.ts
---

### Task 2: Map coverage ranges to graph nodes [depends: 1]
**Files:**
- Modify: `src/indexer/coverage.ts`
- Create: `test/indexer-coverage-mapping.test.ts`
**ACs covered:** 5, 6

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { mapCoverageToNodes, type NormalizedCoverageRecord } from "../src/indexer/coverage.js";

test("mapCoverageToNodes resolves same-file overlapping nodes and prefers the smallest span", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/app.ts::outer:1", kind: "function", name: "outer", file: "src/app.ts", start_line: 1, end_line: 10, content_hash: "h-app" });
    store.addNode({ id: "src/app.ts::inner:3", kind: "function", name: "inner", file: "src/app.ts", start_line: 3, end_line: 5, content_hash: "h-app" });
    store.addNode({ id: "src/app.test.ts::appTest:1", kind: "test", name: "appTest", file: "src/app.test.ts", start_line: 1, end_line: 3, content_hash: "h-test" });

    const records: NormalizedCoverageRecord[] = [
      { reportFile: "report.json", file: "src/app.test.ts", functionName: "appTest", startOffset: 0, endOffset: 10, startLine: 1, endLine: 3, count: 1 },
      { reportFile: "report.json", file: "src/app.ts", functionName: "inner", startOffset: 20, endOffset: 40, startLine: 3, endLine: 5, count: 1 },
      { reportFile: "report.json", file: "src/missing.ts", functionName: "ghost", startOffset: 0, endOffset: 1, startLine: 1, endLine: 1, count: 1 },
    ];

    const mapped = mapCoverageToNodes(store, records);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({ file: "src/app.test.ts", node: { id: "src/app.test.ts::appTest:1", kind: "test" } });
    expect(mapped[1]).toMatchObject({ file: "src/app.ts", node: { id: "src/app.ts::inner:3", kind: "function" } });
    expect(mapped.some((item) => item.node.id === "src/app.ts::outer:1")).toBe(false);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-coverage-mapping.test.ts`
Expected: FAIL — `SyntaxError: Export named 'mapCoverageToNodes' not found in module '../src/indexer/coverage.js'`

**Step 3 — Write minimal implementation**
`src/indexer/coverage.ts` — extend the Task 1 file with:
```ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";

export interface MappedCoverageRecord extends NormalizedCoverageRecord {
  node: GraphNode;
}

function lineSpan(node: GraphNode): number {
  return (node.end_line ?? node.start_line) - node.start_line;
}

function overlaps(node: GraphNode, startLine: number, endLine: number): boolean {
  const nodeEnd = node.end_line ?? node.start_line;
  return node.start_line <= endLine && nodeEnd >= startLine;
}

export function mapCoverageToNodes(store: GraphStore, records: NormalizedCoverageRecord[]): MappedCoverageRecord[] {
  const mapped: MappedCoverageRecord[] = [];

  for (const record of records) {
    const candidates = store
      .getNodesByFile(record.file)
      .filter((node) => overlaps(node, record.startLine, record.endLine))
      .sort((a, b) => lineSpan(a) - lineSpan(b) || a.start_line - b.start_line || a.id.localeCompare(b.id));

    const resolved = candidates[0];
    if (!resolved) continue;
    mapped.push({ ...record, node: resolved });
  }

  return mapped.sort((a, b) => {
    return a.reportFile.localeCompare(b.reportFile)
      || a.file.localeCompare(b.file)
      || a.startLine - b.startLine
      || a.node.id.localeCompare(b.node.id);
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-coverage-mapping.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
