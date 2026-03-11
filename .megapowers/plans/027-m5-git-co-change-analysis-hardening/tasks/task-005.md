---
id: 5
title: SQLite indexes for tool query patterns
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
files_to_create:
  - test/graph-store-indexes.test.ts
---

**AC:** 16 (SQLite indexes)

**Files:**
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-indexes.test.ts`

**Step 1 — Write the failing test**

Create `test/graph-store-indexes.test.ts`:

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SQLite store has index on nodes(name) for findNodes/symbol_graph queries", () => {
  const store = new SqliteGraphStore();
  try {
    const rows = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('nodes') WHERE name = 'idx_nodes_name'"
    );
    expect(rows).toHaveLength(1);
  } finally {
    store.close();
  }
});

test("SQLite store has index on edges(kind) for graph_query kind filters", () => {
  const store = new SqliteGraphStore();
  try {
    const rows = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('edges') WHERE name = 'idx_edges_kind'"
    );
    expect(rows).toHaveLength(1);
  } finally {
    store.close();
  }
});

test("SQLite store preserves existing indexes on nodes(file), edges(source), edges(target)", () => {
  const store = new SqliteGraphStore();
  try {
    const nodeFile = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('nodes') WHERE name = 'idx_nodes_file'"
    );
    expect(nodeFile).toHaveLength(1);

    const edgeSource = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('edges') WHERE name = 'idx_edges_source'"
    );
    expect(edgeSource).toHaveLength(1);

    const edgeTarget = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('edges') WHERE name = 'idx_edges_target'"
    );
    expect(edgeTarget).toHaveLength(1);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-indexes.test.ts`
Expected: FAIL — `expect(received).toHaveLength(expected) // Expected length: 1, Received length: 0` for the `idx_nodes_name` and `idx_edges_kind` queries, since those indexes don't exist yet.

**Step 3 — Write minimal implementation**

In `src/graph/sqlite.ts`, in the `initSchema()` method, add the new CREATE INDEX statements after the existing ones (around line 84):

```ts
// After line 84 (`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);`), add:
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-indexes.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
