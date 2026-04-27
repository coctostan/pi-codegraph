---
id: 1
title: Add hasCoverageData / markCoverageIndexed to GraphStore + SqliteGraphStore
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/graph/store.ts
  - src/graph/sqlite.ts
files_to_create:
  - test/graph-store-coverage-metadata.test.ts
---

Covers AC1, AC2, AC3.

Add a tiny generic `graph_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)` table to SQLite, then expose `hasCoverageData()` and `markCoverageIndexed()` through both the `GraphStore` interface and `SqliteGraphStore`. The state must survive close + reopen.

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Create: `test/graph-store-coverage-metadata.test.ts`

**Step 1 — Write the failing test**

Create `test/graph-store-coverage-metadata.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore.hasCoverageData starts false and toggles true after markCoverageIndexed", () => {
  const store = new SqliteGraphStore();
  try {
    expect(store.hasCoverageData()).toBe(false);
    store.markCoverageIndexed();
    expect(store.hasCoverageData()).toBe(true);
    // idempotent
    store.markCoverageIndexed();
    expect(store.hasCoverageData()).toBe(true);
  } finally {
    store.close();
  }
});

test("SqliteGraphStore.hasCoverageData persists across close + reopen", () => {
  const dir = join(tmpdir(), `pi-cg-cov-meta-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "graph.db");
  try {
    const a = new SqliteGraphStore(dbPath);
    expect(a.hasCoverageData()).toBe(false);
    a.markCoverageIndexed();
    a.close();

    const b = new SqliteGraphStore(dbPath);
    try {
      expect(b.hasCoverageData()).toBe(true);
    } finally {
      b.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/graph-store-coverage-metadata.test.ts`
Expected: FAIL — `TypeError: store.hasCoverageData is not a function` (and `markCoverageIndexed is not a function`).

**Step 3 — Write minimal implementation**

In `src/graph/store.ts`, add to the `GraphStore` interface (after `queryRows<T...>` and before `close()`):

```ts
  hasCoverageData(): boolean;
  markCoverageIndexed(): void;
```

In `src/graph/sqlite.ts`, inside `initSchema()` after the existing `CREATE TABLE IF NOT EXISTS test_trace_steps (...)` block and before `CREATE TABLE IF NOT EXISTS schema_version`, add to the same `this.db.exec(`...`)` SQL:

```sql
      CREATE TABLE IF NOT EXISTS graph_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
```

Then add two methods to the `SqliteGraphStore` class (e.g. just before `close()`):

```ts
  hasCoverageData(): boolean {
    const row = this.db
      .prepare(`SELECT value FROM graph_metadata WHERE key = ?`)
      .get("coverage_indexed") as { value: string } | null;
    return row?.value === "1";
  }

  markCoverageIndexed(): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO graph_metadata (key, value) VALUES (?, ?)`)
      .run("coverage_indexed", "1");
  }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/graph-store-coverage-metadata.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing.
