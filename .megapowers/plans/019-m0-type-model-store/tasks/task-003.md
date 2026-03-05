---
id: 3
title: "SqliteGraphStore bootstrap: constructor default, schema init, and
  schema_version"
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
  - test/graph-store.test.ts
  - test/graph-types.typecheck.ts
files_to_create: []
---

Implement AC 22, 23, and 43.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore constructor accepts default dbPath", () => {
  expect(() => new SqliteGraphStore()).not.toThrow();
});

test("SqliteGraphStore initializes schema_version=1", () => {
  const dir = join(tmpdir(), "pi-codegraph-tests");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `schema-${Date.now()}.sqlite`);
  try {
    new SqliteGraphStore(dbPath);
    const db = new Database(dbPath);
    const rows = db.query("SELECT version FROM schema_version").all() as Array<{ version: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(1);
    db.close();
  } finally {
    rmSync(dbPath, { force: true });
  }
});
```

Append this compile-time assertion to `test/graph-types.typecheck.ts`:

```ts
import type { GraphStore as GraphStoreContract } from "../src/graph/store.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
const sqliteAsStore: GraphStoreContract = new SqliteGraphStore();
void sqliteAsStore;
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `no such table: schema_version`

### Step 3 — Implement full production code for bootstrap
Replace `src/graph/sqlite.ts` with:

```ts
import { Database } from "bun:sqlite";

import type { GraphStore, NeighborOptions, NeighborResult } from "./store.js";
import type { GraphEdge, GraphNode } from "./types.js";

export class SqliteGraphStore implements GraphStore {
  private db: Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        file TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER,
        content_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS edges (
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        kind TEXT NOT NULL,
        provenance TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source, target, kind, provenance)
      );

      CREATE TABLE IF NOT EXISTS file_hashes (
        file TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
    `);

    const existing = this.db
      .query("SELECT version FROM schema_version LIMIT 1")
      .get() as { version: number } | null;

    if (!existing) {
      this.db.query("INSERT INTO schema_version(version) VALUES (1)").run();
    }
  }

  addNode(_node: GraphNode): void {
    throw new Error("Not implemented: addNode");
  }

  addEdge(_edge: GraphEdge): void {
    throw new Error("Not implemented: addEdge");
  }

  getNode(_id: string): GraphNode | null {
    throw new Error("Not implemented: getNode");
  }

  getNeighbors(_nodeId: string, _options?: NeighborOptions): NeighborResult[] {
    throw new Error("Not implemented: getNeighbors");
  }

  getNodesByFile(_file: string): GraphNode[] {
    throw new Error("Not implemented: getNodesByFile");
  }

  deleteFile(_file: string): void {
    throw new Error("Not implemented: deleteFile");
  }

  getFileHash(_file: string): string | null {
    throw new Error("Not implemented: getFileHash");
  }

  setFileHash(_file: string, _hash: string): void {
    throw new Error("Not implemented: setFileHash");
  }

  close(): void {
    throw new Error("Not implemented: close");
  }
}
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for the constructor/schema tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing (including `SqliteGraphStore` assignable to `GraphStore`).

**Acceptance criteria covered:** 22, 23, 43
