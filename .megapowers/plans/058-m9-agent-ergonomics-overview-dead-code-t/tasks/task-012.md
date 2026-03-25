---
id: 12
title: "token-tracker: collectNaiveFiles helpers for each tool"
status: approved
depends_on:
  - 11
no_test: false
files_to_modify:
  - src/tools/token-tracker.ts
files_to_create:
  - test/token-tracker-naive-files.test.ts
---

### Task 12: token-tracker: collectNaiveFiles helpers for each tool [depends: 11]

**Files:**
- Modify: `src/tools/token-tracker.ts`
- Create: `test/token-tracker-naive-files.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/token-tracker-naive-files.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { collectNaiveFiles } from "../src/tools/token-tracker.js";

test("collectNaiveFiles for symbol_graph returns target + neighbor files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h1" }, created_at: Date.now() });

    const files = collectNaiveFiles("symbol_graph", { name: "foo" }, store);
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  } finally {
    store.close();
  }
});

test("collectNaiveFiles for impact returns downstream files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/b.ts::bar:1", target: "src/a.ts::foo:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h2" }, created_at: Date.now() });

    // bar calls foo, so changing foo impacts bar
    const files = collectNaiveFiles("impact", { symbols: ["foo"] }, store);
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/b.ts");
  } finally {
    store.close();
  }
});

test("collectNaiveFiles for graph_overview returns all indexed files", () => {
  const store = new SqliteGraphStore();
  try {
    store.setFileHash("src/a.ts", "h1");
    store.setFileHash("src/b.ts", "h2");

    const files = collectNaiveFiles("graph_overview", {}, store);
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  } finally {
    store.close();
  }
});

test("collectNaiveFiles for trace returns traced path files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::entry:1", kind: "function", name: "entry", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::callee:1", kind: "function", name: "callee", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/a.ts::entry:1", target: "src/b.ts::callee:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h1" }, created_at: Date.now() });

    const files = collectNaiveFiles("trace", { entry: "entry" }, store);
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/b.ts");
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker-naive-files.test.ts`
Expected: FAIL — `error: "collectNaiveFiles" is not exported from "../src/tools/token-tracker.js"`

**Step 3 — Write minimal implementation**

Add to `src/tools/token-tracker.ts`:

```typescript
import type { GraphStore } from "../graph/store.js";

// ... existing code ...

export function collectNaiveFiles(
  toolName: string,
  params: Record<string, unknown>,
  store: GraphStore,
): string[] {
  const files = new Set<string>();

  switch (toolName) {
    case "symbol_graph":
    case "symbol_card":
    case "symbol_contract": {
      const name = params.name as string | undefined;
      const file = params.file as string | undefined;
      if (!name) break;
      const nodes = store.findNodes(name, file);
      for (const node of nodes) {
        if (!node.file.startsWith("__")) files.add(node.file);
        const neighbors = store.getNeighbors(node.id);
        for (const nr of neighbors) {
          if (!nr.node.file.startsWith("__")) files.add(nr.node.file);
        }
      }
      break;
    }

    case "impact": {
      const symbols = params.symbols as string[] | undefined;
      if (!symbols) break;
      for (const sym of symbols) {
        const nodes = store.findNodes(sym);
        for (const node of nodes) {
          if (!node.file.startsWith("__")) files.add(node.file);
          // Collect downstream callers (1 hop for estimation)
          const neighbors = store.getNeighbors(node.id, { direction: "in" });
          for (const nr of neighbors) {
            if (!nr.node.file.startsWith("__")) files.add(nr.node.file);
          }
        }
      }
      break;
    }

    case "trace": {
      const entry = params.entry as string | undefined;
      const file = params.file as string | undefined;
      if (!entry) break;
      const nodes = store.findNodes(entry, file);
      if (nodes.length === 1) {
        const node = nodes[0]!;
        if (!node.file.startsWith("__")) files.add(node.file);
        // Walk call graph outward for estimation
        const seen = new Set<string>([node.id]);
        const stack = [node.id];
        while (stack.length > 0) {
          const id = stack.pop()!;
          const callees = store.getNeighbors(id, { direction: "out", kind: "calls" });
          for (const nr of callees) {
            if (!seen.has(nr.node.id)) {
              seen.add(nr.node.id);
              if (!nr.node.file.startsWith("__")) files.add(nr.node.file);
              stack.push(nr.node.id);
            }
          }
        }
      }
      break;
    }

    case "graph_query": {
      // For graph_query, estimate = all indexed files (we can't predict what the query matches)
      const allFiles = store.listFiles();
      for (const f of allFiles) {
        if (!f.startsWith("__")) files.add(f);
      }
      break;
    }

    case "graph_overview":
    case "dead_code": {
      const allFiles = store.listFiles();
      for (const f of allFiles) {
        if (!f.startsWith("__")) files.add(f);
      }
      break;
    }
  }

  return Array.from(files);
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/token-tracker-naive-files.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
