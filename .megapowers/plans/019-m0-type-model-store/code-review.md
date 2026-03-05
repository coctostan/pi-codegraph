# Code Review: 019-m0-type-model-store

## Files Reviewed

| File | Change | Description |
|------|--------|-------------|
| `src/graph/types.ts` | +48 lines | Full type model: NodeKind, EdgeKind, ProvenanceSource, GraphNode, Provenance, GraphEdge, nodeId |
| `src/graph/store.ts` | +23 lines | GraphStore interface + NeighborOptions + NeighborResult |
| `src/graph/sqlite.ts` | +289 lines | SqliteGraphStore implementation (full replacement of stub) |
| `test/graph-store.test.ts` | +330 lines | 11 behavioral tests covering all store operations |
| `test/graph-types.typecheck.ts` | +55 lines | Compile-time safety checks via @ts-expect-error |

---

## Strengths

**`src/graph/types.ts`:** Minimal and precise. Three separate string literal unions rather than a single wide `string` type eliminates an entire class of silent bugs at the call site. The `nodeId` helper is exported alongside the types — correct placement, avoids a separate utility file for 2 lines.

**`src/graph/store.ts`:** Clean interface segregation. `NeighborOptions` and `NeighborResult` live in `store.ts` (beside the interface that uses them) rather than in `types.ts` (which covers only the graph domain model). That boundary is right.

**`src/graph/sqlite.ts` — `deleteFile` cascade:** The OR condition `WHERE source IN (...) OR target IN (...)` is correct and handles both outbound and cross-file inbound edges in a single DELETE. The explicit transaction with ROLLBACK guards means a partial delete is impossible. This is the riskiest operation in the store and it's handled well.

**`src/graph/sqlite.ts` — `fetchNeighborRows` SQL safety:** The comment at line 161–165 explicitly documents that `joinOn`/`whereField` are hardcoded column references, not user input. The ternary that produces those values is constrained to two literal strings per arm. No SQL injection vector.

**`src/graph/sqlite.ts` — edge PRIMARY KEY:** `(source, target, kind, provenance_source)` allows multiple provenances for the same structural A→B call edge — e.g., tree-sitter at confidence 0.6 and LSP at confidence 0.9 can coexist. This is the correct design for the provenance model described in AGENTS.md.

**`test/graph-types.typecheck.ts` — `@ts-expect-error` pattern:** Using `@ts-expect-error` for negative type tests is exactly right. If `NodeKind` or `EdgeKind` is ever widened to `string`, `tsc --noEmit` immediately fails (the directive becomes unused), making type regressions impossible to merge silently. This is substantially more valuable than a runtime test could be for this property.

**`test/graph-store.test.ts` — test quality:** Every test uses a fresh in-memory store; no shared state. The `deleteFile` test explicitly verifies both the source-side edge, the target-side cross-file edge, and an unrelated edge that must survive — no lazy "it probably works" coverage.

---

## Findings

### Critical
None.

### Important
None.

### Minor

**1. Row-to-node mapping is duplicated three times**
`sqlite.ts` lines 139–147, 234–242, 192–200 each extract the same seven `GraphNode` fields from a DB row into a new object literal. A private static helper would eliminate ~25 lines of duplication:

```ts
private static rowToNode(row: {
  id: string; kind: GraphNode["kind"]; name: string; file: string;
  start_line: number; end_line: number | null; content_hash: string;
}): GraphNode {
  return {
    id: row.id, kind: row.kind, name: row.name, file: row.file,
    start_line: row.start_line, end_line: row.end_line, content_hash: row.content_hash,
  };
}
```

Not blocking for M0, but when the next milestone adds a new `GraphNode` field, all three sites must be updated in sync. A helper makes that a single-site change.

**2. `file_hashes.indexed_at` column is unpublished intent**
`sqlite.ts` line 60 creates `indexed_at INTEGER NOT NULL` and line 285 populates it with `Date.now()`. Nothing in the interface reads this column. This is presumably a placeholder for incremental-indexing staleness detection (AGENTS.md: "Incremental: content hashes per file") but it's undocumented in the code. A one-line comment — `// indexed_at reserved for incremental staleness check (M0 indexer)` — would make the intent clear to future contributors.

**3. `deleteFile` uses manual BEGIN/COMMIT/ROLLBACK instead of `db.transaction()`**
`sqlite.ts` lines 246, 264, 266. `bun:sqlite` exposes `db.transaction(fn)` which wraps `fn` in a deferred transaction and handles rollback automatically, including on thrown exceptions. The manual pattern is correct but more verbose. Either approach is fine for M0; `db.transaction()` would be idiomatic for future edits.

**4. In-memory test stores are not closed after use**
`test/graph-store.test.ts` — the four tests that use in-memory stores (addNode round-trip, addEdge/getNeighbors, getNodesByFile, deleteFile, getFileHash) don't call `store.close()`. For `:memory:` stores this is harmless (the DB is released on GC), but the two disk-backed tests and the schema-column test do call `close()`, creating an inconsistency. Adding `store.close()` at the end of the in-memory tests is a two-line change per test and keeps the pattern uniform.

---

## Recommendations

- **Extract `rowToNode` helper in M1** when a new field is added to `GraphNode` — doing it then avoids the pure refactor overhead now. Put it on the radar.
- **`indexed_at` comment now** — one line, no effort, prevents future "why is this here?" confusion.
- **Adopt `db.transaction()` in future methods** that need transactional semantics (e.g., batch index writes in the tree-sitter indexer). The `deleteFile` precedent already shows the pattern; switching it to `db.transaction()` when the indexer is added would consolidate the style.

---

## Assessment

**ready**

The implementation is correct, well-structured, and appropriate for M0. The three files are cleanly separated by concern (types / interface / implementation). Tests cover all 43 acceptance criteria, including negative type-safety tests that protect against future regressions. The SQLite schema is sound for the planned scope. All four findings are style/hygiene improvements, none block merge.
