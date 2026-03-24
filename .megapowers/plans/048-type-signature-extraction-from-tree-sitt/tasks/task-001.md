---
id: 1
title: Add signature field to GraphNode and SQLite schema
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/graph/types.ts
  - src/graph/sqlite.ts
files_to_create:
  - test/signature-schema.test.ts
---

### Task 1: Add signature field to GraphNode and SQLite schema

**Files:**
- Modify: `src/graph/types.ts`
- Modify: `src/graph/sqlite.ts`
- Test: `test/signature-schema.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-schema.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";

test("GraphNode signature field exists and SQLite column is nullable", () => {
  const store = new SqliteGraphStore();

  const nodeWithSig: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
    is_exported: false,
    signature: "(x: string) => number",
  };

  store.addNode(nodeWithSig);
  const retrieved = store.getNode(nodeWithSig.id);
  expect(retrieved).not.toBeNull();
  expect(retrieved!.signature).toBe("(x: string) => number");

  // Node without signature — should round-trip as undefined
  const nodeWithoutSig: GraphNode = {
    id: "src/a.ts::bar:5",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
    is_exported: false,
  };

  store.addNode(nodeWithoutSig);
  const retrieved2 = store.getNode(nodeWithoutSig.id);
  expect(retrieved2).not.toBeNull();
  expect(retrieved2!.signature).toBeUndefined();
});

test("signature column is added via migration on existing databases", () => {
  const { mkdirSync, rmSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");
  const { Database } = require("bun:sqlite");

  const dir = join(tmpdir(), "pi-codegraph-tests");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `sig-migration-${Date.now()}.sqlite`);

  try {
    // Create a DB with the old schema (no signature column)
    const rawDb = new Database(dbPath);
    rawDb.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        file TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER,
        content_hash TEXT NOT NULL,
        is_exported INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE edges (
        source TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL,
        provenance_source TEXT NOT NULL, confidence REAL NOT NULL,
        evidence TEXT NOT NULL, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (source, target, kind, provenance_source)
      );
      CREATE TABLE file_hashes (file TEXT PRIMARY KEY, hash TEXT NOT NULL, indexed_at INTEGER NOT NULL);
      CREATE TABLE test_trace_steps (
        test_node_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
        node_id TEXT NOT NULL, content_hash TEXT NOT NULL,
        PRIMARY KEY (test_node_id, ordinal)
      );
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version(version) VALUES (1);
    `);
    rawDb.close();

    // Opening with SqliteGraphStore should migrate
    const store = new SqliteGraphStore(dbPath);
    const node: GraphNode = {
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "h1",
      is_exported: false,
      signature: "(x: string) => void",
    };
    store.addNode(node);
    expect(store.getNode(node.id)!.signature).toBe("(x: string) => void");
    store.close();
  } finally {
    rmSync(dbPath, { force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-schema.test.ts`
Expected: FAIL — Property 'signature' does not exist on type 'GraphNode'

**Step 3 — Write minimal implementation**

In `src/graph/types.ts`, add `signature?: string` to `GraphNode`:

```typescript
export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
  is_exported?: boolean;
  signature?: string;
}
```

In `src/graph/sqlite.ts`, make these changes:

1. In `initSchema()`, add after the `is_exported` migration check:

```typescript
    if (!nodeColumns.some((column) => column.name === "signature")) {
      this.db.prepare("ALTER TABLE nodes ADD COLUMN signature TEXT").run();
    }
```

2. Update `addNode()`:

```typescript
  addNode(node: GraphNode): void {
    this.db.prepare(`INSERT OR REPLACE INTO nodes (id, kind, name, file, start_line, end_line, content_hash, is_exported, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(node.id, node.kind, node.name, node.file, node.start_line, node.end_line ?? null, node.content_hash, node.is_exported ? 1 : 0, node.signature ?? null);
  }
```

3. Update `hydrateNode()` — add `signature` to the row type and return:

```typescript
  private hydrateNode(row: { id: string; kind: GraphNode["kind"]; name: string; file: string; start_line: number; end_line: number | null; content_hash: string; is_exported: number | null; signature: string | null; }): GraphNode {
    const node: GraphNode = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      file: row.file,
      start_line: row.start_line,
      end_line: row.end_line,
      content_hash: row.content_hash,
      is_exported: Boolean(row.is_exported),
    };
    if (row.signature != null) {
      node.signature = row.signature;
    }
    return node;
  }
```

4. Update all SELECT queries on nodes to include `signature`:
   - `getNode()`: add `, signature` to SELECT
   - `findNodes()`: add `, signature` to both SQL strings
   - `getNodesByFile()`: add `, signature` to SELECT
   - `fetchNeighborRows()`: add `n.signature` to SELECT, add `signature` to the `NeighborRow` interface, and add signature handling in the row mapper

For `NeighborRow`, add:
```typescript
  signature: string | null;
```

For the `fetchNeighborRows` mapper, update node construction:
```typescript
      node: (() => {
        const n: GraphNode = {
          id: row.id,
          kind: row.kind,
          name: row.name,
          file: row.file,
          start_line: row.start_line,
          end_line: row.end_line,
          content_hash: row.content_hash,
          is_exported: Boolean(row.is_exported),
        };
        if (row.signature != null) n.signature = row.signature;
        return n;
      })(),
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-schema.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 270+ tests passing
