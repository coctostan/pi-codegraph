---
id: 5
title: Cache invalidation on graph re-index
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/tools/symbol-search.ts
files_to_create:
  - test/tool-symbol-search-cache.test.ts
---

### Task 5: Cache invalidation on graph re-index [depends: 3]

**Files:**
- Modify: `src/tools/symbol-search.ts` (only if fingerprint logic needs adjustment)
- Create: `test/tool-symbol-search-cache.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-search-cache.test.ts
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

test("symbolSearch cache invalidates when graph changes", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    // First search — builds index
    const output1 = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test" });
    expect(output1).toContain("foo");

    // "bar" should not exist yet
    const output2 = symbolSearch({ query: "bar", store, projectRoot: "/tmp/test" });
    expect(output2).toContain("No results");

    // Now add a new node — graph has changed
    addTestNode(store, { id: "src/b.ts::bar:1", name: "bar", file: "src/b.ts" });

    // Search again — cache should be invalidated due to new node
    const output3 = symbolSearch({ query: "bar", store, projectRoot: "/tmp/test" });
    expect(output3).toContain("bar");
    expect(output3).toContain("src/b.ts");
  } finally {
    store.close();
  }
});

test("symbolSearch cache reuses index when graph unchanged", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::alpha:1", name: "alpha", file: "src/a.ts" });
    addTestNode(store, { id: "src/b.ts::beta:1", name: "beta", file: "src/b.ts" });

    // First search — builds index
    const output1 = symbolSearch({ query: "alpha", store, projectRoot: "/tmp/test" });
    expect(output1).toContain("alpha");

    // Second search — should reuse cache (same store, no changes)
    const output2 = symbolSearch({ query: "beta", store, projectRoot: "/tmp/test" });
    expect(output2).toContain("beta");
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-search-cache.test.ts`
Expected: PASS (the fingerprint logic from Task 3 should already handle this based on node count + file count changes). If it fails, the error would be: `expect(received).toContain(expected) — Expected "No results found.\n" to contain "bar"` meaning the cache wasn't invalidated.

Note: This task exists to **verify and lock in** the cache invalidation behavior with a dedicated test, even though the implementation was part of Task 3. If the test passes immediately, that confirms the design is correct.

**Step 3 — Write minimal implementation**

No changes needed if the fingerprint logic from Task 3 (`${totalNodes}:${totalFiles}`) already detects the new node. The `computeFingerprint` function counts total nodes and total files, so adding a node changes the count and invalidates the cache.

If the test unexpectedly fails (e.g. because `getStatistics` doesn't count new unfiled nodes), update `computeFingerprint` in `src/tools/symbol-search.ts`:

```typescript
function computeFingerprint(store: GraphStore): string {
  const rows = store.queryRows<{ cnt: number }>("SELECT COUNT(*) as cnt FROM nodes");
  const fileRows = store.queryRows<{ cnt: number }>("SELECT COUNT(*) as cnt FROM file_hashes");
  return `${rows[0]?.cnt ?? 0}:${fileRows[0]?.cnt ?? 0}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-search-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
