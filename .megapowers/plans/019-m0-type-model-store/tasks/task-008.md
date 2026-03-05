---
id: 8
title: "SqliteGraphStore file hash API: getFileHash/setFileHash"
status: approved
depends_on:
  - 7
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
  - test/graph-store.test.ts
files_to_create: []
---

Implement AC 39–41.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("getFileHash returns null initially; setFileHash round-trips and overwrites", () => {
  const store = new SqliteGraphStore();

  expect(store.getFileHash("src/a.ts")).toBeNull();

  store.setFileHash("src/a.ts", "abc123");
  expect(store.getFileHash("src/a.ts")).toBe("abc123");

  store.setFileHash("src/a.ts", "def456");
  expect(store.getFileHash("src/a.ts")).toBe("def456");
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: getFileHash`

### Step 3 — Implement full production code for file hashes
In `src/graph/sqlite.ts`, replace `getFileHash` and `setFileHash` with:

```ts
  getFileHash(file: string): string | null {
    const row = this.db
      .query(`SELECT hash FROM file_hashes WHERE file = ?`)
      .get(file) as { hash: string } | null;

    return row?.hash ?? null;
  }

  setFileHash(file: string, hash: string): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO file_hashes (file, hash, indexed_at)
         VALUES (?, ?, ?)`
      )
      .run(file, hash, Date.now());
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for file hash tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 39, 40, 41
