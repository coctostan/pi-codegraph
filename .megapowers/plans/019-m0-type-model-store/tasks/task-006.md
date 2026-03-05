---
id: 6
title: "SqliteGraphStore file query: getNodesByFile"
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
  - test/graph-store.test.ts
files_to_create: []
---

Implement AC 32–33.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("getNodesByFile returns matching nodes and [] for missing files", () => {
  const store = new SqliteGraphStore();

  const n1 = {
    id: "src/a.ts::foo:1",
    kind: "function" as const,
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 2,
    content_hash: "h1",
  };
  const n2 = {
    id: "src/a.ts::bar:10",
    kind: "function" as const,
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    content_hash: "h2",
  };
  const n3 = {
    id: "src/b.ts::baz:5",
    kind: "function" as const,
    name: "baz",
    file: "src/b.ts",
    start_line: 5,
    end_line: 6,
    content_hash: "h3",
  };

  store.addNode(n1);
  store.addNode(n2);
  store.addNode(n3);

  const fromA = store.getNodesByFile("src/a.ts");
  expect(fromA).toHaveLength(2);
  expect(fromA.map((n) => n.id).sort()).toEqual([n1.id, n2.id].sort());

  expect(store.getNodesByFile("src/missing.ts")).toEqual([]);
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: getNodesByFile`

### Step 3 — Implement full production code for file query
In `src/graph/sqlite.ts`, replace `getNodesByFile` with:

```ts
  getNodesByFile(file: string): GraphNode[] {
    const rows = this.db
      .query(
        `SELECT id, kind, name, file, start_line, end_line, content_hash
         FROM nodes
         WHERE file = ?
         ORDER BY start_line ASC, id ASC`
      )
      .all(file) as Array<{
      id: string;
      kind: GraphNode["kind"];
      name: string;
      file: string;
      start_line: number;
      end_line: number | null;
      content_hash: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      file: row.file,
      start_line: row.start_line,
      end_line: row.end_line,
      content_hash: row.content_hash,
    }));
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for `getNodesByFile` behavior tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 32, 33
