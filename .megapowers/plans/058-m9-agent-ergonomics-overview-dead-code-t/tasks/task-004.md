---
id: 4
title: "graph_overview: suggested queries conditional on edge kinds"
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/tools/graph-overview.ts
files_to_create:
  - test/tool-graph-overview-queries.test.ts
---

### Task 4: graph_overview: suggested queries conditional on edge kinds [depends: 3]

**Files:**
- Modify: `src/tools/graph-overview.ts`
- Create: `test/tool-graph-overview-queries.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-queries.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview suggests queries only for edge kinds present in the graph", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-queries-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  const fileB = "export function bar() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    // Only 'calls' edges — no routes_to, no tested_by, etc.
    store.addEdge({ source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashA }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Suggested Queries");
    // Should include a calls-related query
    expect(output).toContain("calls");
    // Should NOT include routes_to queries since no route edges exist
    expect(output).not.toContain("routes_to");
    // Should NOT include tested_by queries since no test edges exist
    expect(output).not.toContain("tested_by");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("graphOverview suggests route queries when routes_to edges exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-routes-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function handler() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);

    store.addNode({ id: "src/a.ts::handler:1", kind: "function", name: "handler", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "__meta__::GET /api:1", kind: "endpoint", name: "GET /api", file: "__meta__", start_line: 1, end_line: 1, content_hash: "x" });

    store.addEdge({ source: "src/a.ts::handler:1", target: "__meta__::GET /api:1", kind: "routes_to", provenance: { source: "ast-grep", confidence: 0.8, evidence: "route", content_hash: hashA }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Suggested Queries");
    expect(output).toContain("routes_to");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-queries.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected string "..." to contain "## Suggested Queries"`

**Step 3 — Write minimal implementation**

Add suggested queries section to `graphOverview` in `src/tools/graph-overview.ts`, after the Most-Imported Files section:

```typescript
  // Suggested Queries section
  const presentEdgeKinds = new Set(Object.keys(stats.edges));
  const recipes: string[] = [];

  // Always-present recipes (if any nodes exist)
  recipes.push('MATCH (n {kind: "function"}) RETURN n LIMIT 10');

  if (presentEdgeKinds.has("calls")) {
    recipes.push('MATCH (a)-[r:calls]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("imports")) {
    recipes.push('MATCH (a)-[r:imports]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("tested_by")) {
    recipes.push('MATCH (a)-[r:tested_by]->(t) RETURN a.name, t.name LIMIT 10');
  }
  if (presentEdgeKinds.has("implements")) {
    recipes.push('MATCH (a)-[r:implements]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("routes_to")) {
    recipes.push('MATCH (a)-[r:routes_to]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("renders")) {
    recipes.push('MATCH (a)-[r:renders]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("co_changes_with")) {
    recipes.push('MATCH (a)-[r:co_changes_with]->(b) RETURN a.name, b.name LIMIT 10');
  }

  if (recipes.length > 0) {
    lines.push("");
    lines.push("## Suggested Queries");
    for (const recipe of recipes) {
      lines.push(recipe);
    }
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-queries.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
