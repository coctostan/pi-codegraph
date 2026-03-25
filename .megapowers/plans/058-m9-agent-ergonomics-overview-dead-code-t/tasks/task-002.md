---
id: 2
title: "graph_overview: hub symbols (top 10 by degree)"
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/graph-overview.ts
files_to_create:
  - test/tool-graph-overview-hubs.test.ts
---

### Task 2: graph_overview: hub symbols (top 10 by degree) [depends: 1]

**Files:**
- Modify: `src/tools/graph-overview.ts`
- Create: `test/tool-graph-overview-hubs.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-hubs.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview includes hub symbols sorted by degree", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-hubs-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function hub() {}\n";
  const fileB = "export function leaf1() {}\n";
  const fileC = "export function leaf2() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);
  writeFileSync(join(projectRoot, "src/c.ts"), fileC);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    const hashC = sha256Hex(fileC);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.setFileHash("src/c.ts", hashC);

    store.addNode({ id: "src/a.ts::hub:1", kind: "function", name: "hub", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::leaf1:1", kind: "function", name: "leaf1", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });
    store.addNode({ id: "src/c.ts::leaf2:1", kind: "function", name: "leaf2", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: hashC, is_exported: true });

    // hub calls both leaves — degree 2
    store.addEdge({ source: "src/a.ts::hub:1", target: "src/b.ts::leaf1:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashA }, created_at: Date.now() });
    store.addEdge({ source: "src/a.ts::hub:1", target: "src/c.ts::leaf2:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashA }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Hub Symbols");
    expect(output).toContain("hub");
    expect(output).toContain("function");
    expect(output).toContain("src/a.ts");
    // hub has degree 2, leaves have degree 1 each
    // hub should appear first
    const hubIdx = output.indexOf("hub");
    const leaf1Idx = output.indexOf("leaf1");
    expect(hubIdx).toBeLessThan(leaf1Idx);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-hubs.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected string "..." to contain "## Hub Symbols"`

**Step 3 — Write minimal implementation**

Add to `src/tools/graph-overview.ts` — after the Files section, before the final `return`:

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
  for (const [kind, count] of Object.entries(stats.nodes)) {
    if (!kindOrder.includes(kind)) {
      lines.push(`${kind}: ${count}`);
    }
  }

  // Files section
  lines.push("");
  lines.push("## Files");
  lines.push(`total: ${stats.files.total}  stale: ${stats.files.stale}`);

  // Hub symbols section
  const hubRows = store.queryRows<{ id: string; name: string; kind: string; file: string; degree: number }>(
    `SELECT n.id, n.name, n.kind, n.file,
       (SELECT COUNT(*) FROM edges WHERE source = n.id OR target = n.id) as degree
     FROM nodes n
     WHERE NOT n.file LIKE '__meta__%' AND NOT n.file LIKE '__unresolved__%'
     ORDER BY degree DESC
     LIMIT 10`
  );
  if (hubRows.length > 0) {
    lines.push("");
    lines.push("## Hub Symbols");
    for (const row of hubRows) {
      lines.push(`${row.name}  ${row.kind}  ${row.file}  degree:${row.degree}`);
    }
  }

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-hubs.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
