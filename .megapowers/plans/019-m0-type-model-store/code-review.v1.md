# Code Review — 019-m0-type-model-store

## Files Reviewed

| File | Change |
|------|--------|
| `src/graph/types.ts` | Full replacement: added `NodeKind`, `EdgeKind`, `ProvenanceSource` unions; `Provenance`, `GraphNode`, `GraphEdge` interfaces; `nodeId()` function |
| `src/graph/store.ts` | Full replacement: `NeighborOptions`, `NeighborResult`, `GraphStore` interface |
| `src/graph/sqlite.ts` | Full replacement: `SqliteGraphStore` class implementing `GraphStore` with SQLite backend |
| `test/graph-store.test.ts` | Full replacement: 9 integration tests covering all SQLite store operations |
| `test/graph-types.typecheck.ts` | Full replacement: compile-time type assertions using `@ts-expect-error` + structural checks |

---

## Strengths

**`src/graph/types.ts`** — Minimal and precise. String-literal unions enforce type safety without boilerplate. `nodeId()` is a simple, testable pure function. `Provenance` as a nested object on `GraphEdge` rather than flat fields on the edge keeps the API clean. *(types.ts:1–54)*

**`src/graph/store.ts`** — The interface is small, complete, and dependency-free. Using an interface (not abstract class) means any backend can implement it without inheritance coupling. `NeighborOptions` with optional fields gives callers a clean filter API without overloads. *(store.ts:1–23)*

**`src/graph/sqlite.ts` — schema design** — `INSERT OR REPLACE` for both nodes and edges gives upsert semantics throughout, preventing duplicate-key errors. The `deleteFile` cascade (`DELETE FROM edges WHERE source IN ... OR target IN ...`) correctly handles both outbound and cross-file inbound edges in a single statement, wrapped in a manual transaction. *(sqlite.ts:299–315)*

**`src/graph/sqlite.ts` — schema_version guard** — Checking for the existing row before inserting prevents duplicate initialization on re-open, even though `CREATE TABLE IF NOT EXISTS` handles the table itself. *(sqlite.ts:53–59)*

**`test/graph-store.test.ts`** — Tests are behavioral, not implementation-coupled. The `deleteFile` test explicitly verifies both outbound and inbound edge cascade, plus checks that unrelated data in other files survives. *(graph-store.test.ts:190–270)* The persistence test uses a real file path with proper cleanup in `finally`. *(graph-store.test.ts:284–310)*

**`test/graph-types.typecheck.ts`** — Using `@ts-expect-error` to assert invalid assignments are compile errors is a clean, zero-runtime pattern for type-level testing. Checking `const sqliteAsStore: GraphStoreContract = new SqliteGraphStore()` structurally verifies implementation without needing a runtime method call. *(graph-types.typecheck.ts:60–77)*

---

## Findings

### Critical
None.

---

### Important

#### I-1: `provenance` column name stores only `ProvenanceSource`, not the full `Provenance` object
**File:** `src/graph/sqlite.ts:30, 35, 84, 140, 146, 187, 202, 208, 249`

**What's wrong:** The `edges` table has a column named `provenance` (line 30) and it's part of the `PRIMARY KEY (source, target, kind, provenance)` (line 35). But the value stored is only `edge.provenance.source` — a `ProvenanceSource` string like `"tree-sitter"`. The full `Provenance` object is spread across four columns: `provenance`, `confidence`, `evidence`, `content_hash`.

```sql
-- Current (confusing): column named 'provenance' stores "tree-sitter"
PRIMARY KEY (source, target, kind, provenance)

-- Intended meaning: primary key is per-source-layer
PRIMARY KEY (source, target, kind, provenance_source)
```

Downstream consequence: M1 indexers and M5's `graph_query` tool will read this schema. A developer reading `SELECT ... e.provenance ...` will expect a JSON blob or a foreign key to a provenance table — not a bare source string. The row type annotation `provenance: GraphEdge["provenance"]["source"]` (line 164/226) documents the mismatch but only in TypeScript, not in the DB.

**Why it matters:** This is foundational schema. Fixing it after M1 indexers start writing edges requires a migration. The name should be `provenance_source` everywhere.

**How to fix:**
- Rename column `provenance` → `provenance_source` in `CREATE TABLE edges`
- Update `PRIMARY KEY` clause
- Update `INSERT OR REPLACE INTO edges (...)` column list
- Update `SELECT ... e.provenance ...` → `e.provenance_source` in `fetchNeighborRows`
- Update row-type annotations and `source: row.provenance` → `source: row.provenance_source`

---

#### I-2: `getNeighbors` contains ~130 lines of near-identical code duplicated for "out" and "in" directions
**File:** `src/graph/sqlite.ts:131–261`

**What's wrong:** The method runs two near-identical blocks (lines 136–196 for "out", lines 198–258 for "in"). The only differences are the JOIN side (`e.target` vs `e.source`) and the WHERE filter (`e.source = ?` vs `e.target = ?`). Everything else — the SELECT columns, the row type annotation (~15 fields), and the result mapping (~20 lines) — is identical. The method is 131 lines for logic that should be ~50.

**Why it matters:** `getNeighbors` is the hottest read path. When M2 adds confidence-based filtering or M3 adds framework-edge kinds, this code will need to change in two places. Divergence between the blocks (e.g., forgetting to update one) is a latent bug vector.

**How to fix:** Extract a private `fetchNeighborRows(nodeId, direction: "in"|"out", kind?)` helper. The two blocks collapse into:

```ts
getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[] {
  const direction = options?.direction ?? "both";
  const kind = options?.kind;
  if (direction === "out") return this.fetchNeighborRows(nodeId, "out", kind);
  if (direction === "in") return this.fetchNeighborRows(nodeId, "in", kind);
  return [
    ...this.fetchNeighborRows(nodeId, "out", kind),
    ...this.fetchNeighborRows(nodeId, "in", kind),
  ];
}
```

The helper derives `JOIN nodes n ON n.id = ${joinSide}` and `WHERE ${whereField} = ?` from `direction === "out"` — these are internal enum-derived constants, not user input, so no injection risk.

---

### Minor

#### M-1: Duplicate `GraphStore` import in typecheck file
**File:** `test/graph-types.typecheck.ts:3–4`

```ts
import type { GraphStore } from "../src/graph/store.js";
import type { GraphStore as GraphStoreContract } from "../src/graph/store.js";
```

Same symbol imported twice with two aliases. `GraphStore` is used on line 60, `GraphStoreContract` on line 76. One import is sufficient; use a single alias throughout (or just `GraphStore`).

---

#### M-2: `schema_version` table has no uniqueness constraint
**File:** `src/graph/sqlite.ts:44–46`

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);
```

No `PRIMARY KEY` or `UNIQUE` constraint. The `LIMIT 1` guard in `initSchema` prevents duplicate rows in practice (single-process, no concurrent writers for M0), but the schema itself allows them. A future migration runner could accidentally insert a second row. Cleaner: add `PRIMARY KEY` or a single-row sentinel (`id INTEGER PRIMARY KEY CHECK(id=1)`).

---

#### M-3: `deleteFile` uses raw `exec("BEGIN")`/`exec("COMMIT")` instead of `db.transaction()`
**File:** `src/graph/sqlite.ts:293–315`

`bun:sqlite` exposes `db.transaction(fn)` which handles rollback automatically and is slightly more idiomatic. The manual approach is correct but more verbose and requires remembering to always pair `BEGIN` with `COMMIT`/`ROLLBACK`.

---

#### M-4: No test for `addEdge` upsert semantics
**File:** `test/graph-store.test.ts`

When the same `(source, target, kind, provenance_source)` tuple is inserted twice with different `confidence`, `INSERT OR REPLACE` should overwrite — the same upsert behavior as `addNode`. This is exercised indirectly (behavior inherited from SQLite), but no explicit assertion covers it. Low risk; worth adding when the test file is next touched.

---

## Recommendations

1. **Fix I-1 and I-2 before merge** — these are foundational: the schema column name and the `getNeighbors` duplication will be touched by every subsequent milestone. Fixing them now is far cheaper than after M1 indexers are written.

2. **Fix M-1 (duplicate import) alongside I-1/I-2** — it's a 2-line change.

3. **M-2 through M-4** — acceptable for M0, note for the first schema migration task (likely M5 or a standalone cleanup issue).

4. **Consider adding FK constraints in a future migration** — `edges.source` and `edges.target` reference `nodes.id` with no `FOREIGN KEY` enforcement. SQLite requires `PRAGMA foreign_keys = ON` to activate them. For M0, the cascade logic in `deleteFile` is manual and correct. Enabling FK constraints in a later migration would make the DB self-enforcing.

---

## Assessment

**needs-fixes**

All 43 acceptance criteria pass; the feature is functionally complete. However, two Important quality issues must be resolved before merge:

- **I-1** (`provenance` column misnaming) will cause maintenance confusion in every subsequent milestone that touches the edges table. The schema is the API contract for all indexers and tools.
- **I-2** (130-line `getNeighbors` duplication) creates a latent divergence risk for every M1–M5 feature that extends neighbor querying.

Returning to implement for targeted fixes: column rename + helper extraction + duplicate import removal.
