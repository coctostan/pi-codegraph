---
id: 7
title: "SqliteGraphStore invalidation: deleteFile removes file nodes and
  touching edges"
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
  - test/graph-store.test.ts
files_to_create: []
---

Implement AC 34–38.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("deleteFile removes file nodes and all touching edges, preserves unrelated data", () => {
  const store = new SqliteGraphStore();

  const a = {
    id: "src/a.ts::a:1",
    kind: "function" as const,
    name: "a",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "ha",
  };
  const b = {
    id: "src/b.ts::b:1",
    kind: "function" as const,
    name: "b",
    file: "src/b.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "hb",
  };
  const c = {
    id: "src/c.ts::c:1",
    kind: "function" as const,
    name: "c",
    file: "src/c.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "hc",
  };

  store.addNode(a);
  store.addNode(b);
  store.addNode(c);

  // source in src/a.ts
  store.addEdge({
    source: a.id,
    target: b.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 1, evidence: "a->b", content_hash: "e1" },
    created_at: 1,
  });

  // target in src/a.ts (incoming cross-file)
  store.addEdge({
    source: c.id,
    target: a.id,
    kind: "imports",
    provenance: { source: "tree-sitter", confidence: 1, evidence: "c->a", content_hash: "e2" },
    created_at: 2,
  });

  // unrelated edge (must survive)
  store.addEdge({
    source: b.id,
    target: c.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 1, evidence: "b->c", content_hash: "e3" },
    created_at: 3,
  });

  store.deleteFile("src/a.ts");

  expect(store.getNodesByFile("src/a.ts")).toEqual([]);

  // edge where source was in src/a.ts is removed
  expect(store.getNeighbors(a.id, { direction: "out" })).toEqual([]);

  // edge where target was in src/a.ts is removed
  expect(store.getNeighbors(a.id, { direction: "in" })).toEqual([]);

  // nodes in other files remain
  expect(store.getNodesByFile("src/b.ts")).toHaveLength(1);
  expect(store.getNodesByFile("src/c.ts")).toHaveLength(1);

  // unrelated edge remains
  const bOut = store.getNeighbors(b.id, { direction: "out" });
  expect(bOut).toHaveLength(1);
  expect(bOut[0]?.node.id).toBe(c.id);
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: deleteFile`

### Step 3 — Implement full production code for invalidation
In `src/graph/sqlite.ts`, replace `deleteFile` with:

```ts
  deleteFile(file: string): void {
    this.db.exec("BEGIN");

    try {
      // 1) delete edges touching nodes from the file (source OR target)
      this.db
        .query(
          `DELETE FROM edges
           WHERE source IN (SELECT id FROM nodes WHERE file = ?)
              OR target IN (SELECT id FROM nodes WHERE file = ?)`
        )
        .run(file, file);

      // 2) delete nodes from the file
      this.db.query(`DELETE FROM nodes WHERE file = ?`).run(file);

      // 3) delete file hash row
      this.db.query(`DELETE FROM file_hashes WHERE file = ?`).run(file);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for deleteFile invalidation tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 34, 35, 36, 37, 38
