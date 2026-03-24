---
id: 1
title: "graph_overview: node kind distribution and file stats"
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/graph-overview.ts
  - test/tool-graph-overview-stats.test.ts
---

### Task 1: graph_overview: node kind distribution and file stats

**Files:**
- Create: `src/tools/graph-overview.ts`
- Create: `test/tool-graph-overview-stats.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-stats.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview includes node kind distribution and file stats", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-stats-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  const fileB = "export class Bar {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::Bar:1", kind: "class", name: "Bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    const output = graphOverview({ store, projectRoot });

    // Trust header
    expect(output).toContain("## Trust");

    // Symbols section with counts
    expect(output).toContain("## Symbols");
    expect(output).toContain("function: 1");
    expect(output).toContain("class: 1");

    // Files section
    expect(output).toContain("## Files");
    expect(output).toContain("total: 2");
    expect(output).toContain("stale: 0");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("graphOverview returns empty graph message when no nodes exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-empty-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const output = graphOverview({ store, projectRoot });
    expect(output).toContain("## Trust");
    expect(output).toContain("empty");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-stats.test.ts`
Expected: FAIL — `error: Cannot find module "../src/tools/graph-overview.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/tools/graph-overview.ts
import type { GraphStore } from "../graph/store.js";
import { prependTrustHeader } from "../output/trust.js";

export interface GraphOverviewParams {
  store: GraphStore;
  projectRoot: string;
}

export function graphOverview(params: GraphOverviewParams): string {
  const { store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);

  // Check for empty graph
  const totalNodes = Object.values(stats.nodes).reduce((sum, n) => sum + n, 0);
  if (totalNodes === 0) {
    return prependTrustHeader("Graph is empty — index a project first.", { stats });
  }

  const lines: string[] = [];

  // Symbols section
  lines.push("## Symbols");
  const kindOrder = ["function", "class", "interface", "module", "endpoint", "test"];
  for (const kind of kindOrder) {
    if (stats.nodes[kind]) {
      lines.push(`${kind}: ${stats.nodes[kind]}`);
    }
  }
  // Any kinds not in the canonical order
  for (const [kind, count] of Object.entries(stats.nodes)) {
    if (!kindOrder.includes(kind)) {
      lines.push(`${kind}: ${count}`);
    }
  }

  // Files section
  lines.push("");
  lines.push("## Files");
  lines.push(`total: ${stats.files.total}  stale: ${stats.files.stale}`);

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-stats.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
