---
id: 9
title: "SqliteGraphStore lifecycle: close() and reopen persistence"
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
  - test/graph-store.test.ts
files_to_create: []
---

Implement AC 42.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("data persists after close() and reopen with same db path", () => {
  const dir = join(tmpdir(), "pi-codegraph-tests");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `persist-${Date.now()}.sqlite`);

  try {
    const n1 = {
      id: "src/persist.ts::keep:1",
      kind: "function" as const,
      name: "keep",
      file: "src/persist.ts",
      start_line: 1,
      end_line: 2,
      content_hash: "persist-hash",
    };

    const store1 = new SqliteGraphStore(dbPath);
    store1.addNode(n1);
    store1.close();

    const store2 = new SqliteGraphStore(dbPath);
    expect(store2.getNode(n1.id)).toEqual(n1);
    store2.close();
  } finally {
    rmSync(dbPath, { force: true });
  }
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: close`

### Step 3 — Implement full production code for close
In `src/graph/sqlite.ts`, replace `close` with:

```ts
  close(): void {
    this.db.close();
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for persistence lifecycle test.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 42
