---
id: 2
title: Persist `is_exported` in SQLite nodes
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
files_to_create:
  - test/graph-store-exported-flag.test.ts
---

**Files:**
- Create: `test/graph-store-exported-flag.test.ts`
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-exported-flag.test.ts`

**TDD Steps:**
1. Add a store test that inserts a node with `is_exported: true`, expects `getNode()` to round-trip it, and verifies `PRAGMA table_info(nodes)` includes an `is_exported` column.
2. Run `bun test test/graph-store-exported-flag.test.ts` and confirm it fails because the schema/query layer does not persist the flag.
3. Update the SQLite schema, add an idempotent `ALTER TABLE` migration for existing DBs, and thread `is_exported` through `addNode`, `getNode`, `findNodes`, `getNodesByFile`, and neighbor row hydration. Because `ALTER TABLE ... ADD COLUMN` yields `NULL` for pre-existing rows until rewritten, coerce hydrated values with `Boolean(row.is_exported)` so missing/NULL flags read back as `false`.
4. Re-run `bun test test/graph-store-exported-flag.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.
