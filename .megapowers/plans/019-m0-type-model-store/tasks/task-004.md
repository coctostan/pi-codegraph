---
id: 4
title: "SqliteGraphStore nodes: addNode/getNode with upsert semantics"
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
  - test/graph-store.test.ts
files_to_create: []
---

Implement AC 24–26.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("addNode + getNode round-trip, upsert, and unknown returns null", () => {
  const store = new SqliteGraphStore();

  const original = {
    id: "src/a.ts::foo:1",
    kind: "function" as const,
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  };

  store.addNode(original);
  expect(store.getNode(original.id)).toEqual(original);

  const updated = { ...original, end_line: 4, content_hash: "h2" };
  store.addNode(updated);
  expect(store.getNode(original.id)).toEqual(updated);

  expect(store.getNode("src/a.ts::missing:99")).toBeNull();
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: addNode`

### Step 3 — Implement full production code for node methods
In `src/graph/sqlite.ts`, replace `addNode` and `getNode` with:

```ts
  addNode(node: GraphNode): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO nodes
          (id, kind, name, file, start_line, end_line, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        node.id,
        node.kind,
        node.name,
        node.file,
        node.start_line,
        node.end_line,
        node.content_hash
      );
  }

  getNode(id: string): GraphNode | null {
    const row = this.db
      .query(
        `SELECT id, kind, name, file, start_line, end_line, content_hash
         FROM nodes
         WHERE id = ?`
      )
      .get(id) as
      | {
          id: string;
          kind: GraphNode["kind"];
          name: string;
          file: string;
          start_line: number;
          end_line: number | null;
          content_hash: string;
        }
      | null;

    if (!row) return null;

    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      file: row.file,
      start_line: row.start_line,
      end_line: row.end_line,
      content_hash: row.content_hash,
    };
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for node behavior tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 24, 25, 26
