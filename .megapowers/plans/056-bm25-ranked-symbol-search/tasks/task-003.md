---
id: 3
title: symbolSearch tool function with lazy index and cache
status: approved
depends_on:
  - 2
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/symbol-search.ts
  - test/tool-symbol-search.test.ts
---

### Task 3: symbolSearch tool function with lazy index and cache [depends: 2]

**Files:**
- Create: `src/tools/symbol-search.ts`
- Create: `test/tool-symbol-search.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-search.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolSearch, resetSearchCacheForTesting } from "../src/tools/symbol-search.js";
import type { GraphNode } from "../src/graph/types.js";

function addTestNode(store: SqliteGraphStore, overrides: Partial<GraphNode> & { id: string; name: string; file: string }): void {
  store.addNode({
    kind: "function",
    start_line: 1,
    end_line: 10,
    content_hash: "abc123",
    is_exported: true,
    ...overrides,
  });
  store.setFileHash(overrides.file, "hash1");
}

test("symbolSearch returns ranked results for a partial name match", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::graphStore:1", name: "graphStore", file: "src/a.ts", signature: "class GraphStore" });
    addTestNode(store, { id: "src/b.ts::addNode:1", name: "addNode", file: "src/b.ts", signature: "addNode(node: GraphNode): void" });
    addTestNode(store, { id: "src/c.ts::getNode:1", name: "getNode", file: "src/c.ts", signature: "getNode(id: string): GraphNode" });

    const output = symbolSearch({ query: "graph store", store, projectRoot: "/tmp/test" });
    expect(output).toContain("graphStore");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("function");
  } finally {
    store.close();
  }
});

test("symbolSearch returns empty for no matches", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    const output = symbolSearch({ query: "zzzzNotExist", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});

test("symbolSearch returns empty for empty query", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    const output = symbolSearch({ query: "", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});

test("symbolSearch includes signature when present", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:5", name: "foo", file: "src/a.ts", signature: "function foo(x: number): string" });

    const output = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test" });
    expect(output).toContain("function foo(x: number): string");
  } finally {
    store.close();
  }
});

test("symbolSearch respects limit parameter", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    for (let i = 0; i < 10; i++) {
      addTestNode(store, { id: `src/${i}.ts::foo${i}:1`, name: `foo${i}`, file: `src/${i}.ts` });
    }

    const output = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test", limit: 3 });
    // Count result lines (each result has the name in it)
    const matches = output.split("\n").filter((line) => /^\d+\./.test(line.trim()));
    expect(matches.length).toBe(3);
  } finally {
    store.close();
  }
});

test("symbolSearch default limit is 20", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    for (let i = 0; i < 30; i++) {
      addTestNode(store, { id: `src/${i}.ts::foo${i}:1`, name: `foo${i}`, file: `src/${i}.ts` });
    }

    const output = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test" });
    const matches = output.split("\n").filter((line) => /^\d+\./.test(line.trim()));
    expect(matches.length).toBe(20);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-search.test.ts`
Expected: FAIL — error: Cannot find module "../src/tools/symbol-search.js"

**Step 3 — Write minimal implementation**

```typescript
// src/tools/symbol-search.ts
import type { GraphStore } from "../graph/store.js";
import type { NodeKind } from "../graph/types.js";
import { BM25Index } from "./bm25.js";

export interface SymbolSearchParams {
  query: string;
  kind?: NodeKind;
  file?: string;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}

interface CachedIndex {
  index: BM25Index;
  nodeMap: Map<string, { name: string; kind: string; file: string; startLine: number; signature?: string }>;
  fingerprint: string;
}

let cachedIndex: CachedIndex | null = null;

export function resetSearchCacheForTesting(): void {
  cachedIndex = null;
}

function computeFingerprint(store: GraphStore): string {
  const stats = store.getStatistics();
  const totalNodes = Object.values(stats.nodes).reduce((a, b) => a + b, 0);
  const totalFiles = stats.files.total;
  return `${totalNodes}:${totalFiles}`;
}

function getOrBuildIndex(store: GraphStore): CachedIndex {
  const fingerprint = computeFingerprint(store);
  if (cachedIndex && cachedIndex.fingerprint === fingerprint) {
    return cachedIndex;
  }

  const rows = store.queryRows<{
    id: string; name: string; kind: string; file: string;
    start_line: number; signature: string | null;
  }>("SELECT id, name, kind, file, start_line, signature FROM nodes ORDER BY id");

  const index = new BM25Index();
  const nodeMap = new Map<string, { name: string; kind: string; file: string; startLine: number; signature?: string }>();

  for (const row of rows) {
    index.addDocument(row.id, {
      name: row.name,
      signature: row.signature ?? "",
      file: row.file,
    });
    nodeMap.set(row.id, {
      name: row.name,
      kind: row.kind,
      file: row.file,
      startLine: row.start_line,
      ...(row.signature ? { signature: row.signature } : {}),
    });
  }

  index.build();
  cachedIndex = { index, nodeMap, fingerprint };
  return cachedIndex;
}

export function symbolSearch(params: SymbolSearchParams): string {
  const { query, limit = 20, store, projectRoot } = params;
  const { index, nodeMap } = getOrBuildIndex(store);

  const rawResults = index.search(query, limit);

  if (rawResults.length === 0) {
    return "No results found.\n";
  }

  const lines: string[] = [];
  lines.push(`## Search Results (${rawResults.length})\n`);

  let rank = 0;
  for (const result of rawResults) {
    const meta = nodeMap.get(result.id);
    if (!meta) continue;
    rank++;
    lines.push(`${rank}. **${meta.name}** (${meta.kind})  score: ${result.score}`);
    lines.push(`   ${meta.file}:${meta.startLine}`);
    if (meta.signature) {
      lines.push(`   ${meta.signature}`);
    }
  }

  return lines.join("\n") + "\n";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
