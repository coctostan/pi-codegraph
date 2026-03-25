---
id: 4
title: "Filters: kind and file glob"
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/tools/symbol-search.ts
files_to_create:
  - test/tool-symbol-search-filters.test.ts
---

### Task 4: Filters: kind and file glob [depends: 3]

**Files:**
- Modify: `src/tools/symbol-search.ts`
- Create: `test/tool-symbol-search-filters.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-search-filters.test.ts
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

test("symbolSearch kind filter excludes non-matching kinds", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::graphStore:1", name: "graphStore", file: "src/a.ts", kind: "class" });
    addTestNode(store, { id: "src/b.ts::graphNode:1", name: "graphNode", file: "src/b.ts", kind: "interface" });
    addTestNode(store, { id: "src/c.ts::getGraph:1", name: "getGraph", file: "src/c.ts", kind: "function" });

    const output = symbolSearch({ query: "graph", kind: "class", store, projectRoot: "/tmp/test" });
    expect(output).toContain("graphStore");
    expect(output).not.toContain("graphNode");
    expect(output).not.toContain("getGraph");
  } finally {
    store.close();
  }
});

test("symbolSearch file glob filter narrows results", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/graph/store.ts::graphStore:1", name: "graphStore", file: "src/graph/store.ts" });
    addTestNode(store, { id: "src/tools/foo.ts::graphQuery:1", name: "graphQuery", file: "src/tools/foo.ts" });

    const output = symbolSearch({ query: "graph", file: "src/graph/**", store, projectRoot: "/tmp/test" });
    expect(output).toContain("graphStore");
    expect(output).not.toContain("graphQuery");
  } finally {
    store.close();
  }
});

test("symbolSearch kind filter with no matches returns empty", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts", kind: "function" });

    const output = symbolSearch({ query: "foo", kind: "class", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});

test("symbolSearch file glob filter with no matches returns empty", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    const output = symbolSearch({ query: "foo", file: "lib/**", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-search-filters.test.ts`
Expected: FAIL — the kind and file filters are not yet applied, so excluded symbols will appear in output (assertions like `expect(output).not.toContain("graphNode")` will fail)

**Step 3 — Write minimal implementation**

Update `src/tools/symbol-search.ts` — modify the `symbolSearch` function to apply filters post-scoring:

```typescript
// src/tools/symbol-search.ts — replace the symbolSearch function

function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob to regex: ** -> match anything, * -> match non-slash
  const regexStr = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")
    + "$";
  return new RegExp(regexStr).test(filePath);
}

export function symbolSearch(params: SymbolSearchParams): string {
  const { query, kind, file, limit = 20, store, projectRoot } = params;
  const { index, nodeMap } = getOrBuildIndex(store);

  // Get more results than limit to account for post-filtering
  const fetchLimit = (kind || file) ? Math.max(limit * 5, 200) : limit;
  const rawResults = index.search(query, fetchLimit);

  // Apply post-scoring filters
  const filtered = rawResults.filter((result) => {
    const meta = nodeMap.get(result.id);
    if (!meta) return false;
    if (kind && meta.kind !== kind) return false;
    if (file && !matchGlob(meta.file, file)) return false;
    return true;
  });

  const limited = filtered.slice(0, limit);

  if (limited.length === 0) {
    return "No results found.\n";
  }

  const lines: string[] = [];
  lines.push(`## Search Results (${limited.length})\n`);

  let rank = 0;
  for (const result of limited) {
    const meta = nodeMap.get(result.id)!;
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
Run: `bun test test/tool-symbol-search-filters.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
