# Code Review — 020-m0-tree-sitter-indexer-incremental-hashi

## Files Reviewed

| File | Description |
|------|-------------|
| `src/graph/types.ts` | GraphNode, GraphEdge, Provenance, NodeKind, EdgeKind types + `nodeId()` |
| `src/graph/store.ts` | GraphStore interface, NeighborOptions, NeighborResult |
| `src/graph/sqlite.ts` | Full SQLite implementation of GraphStore |
| `src/indexer/tree-sitter.ts` | extractFile: AST walk → nodes + import/call edges |
| `src/indexer/pipeline.ts` | indexProject: incremental file walking with hash-based skip/re-index |
| `test/indexer-extract-file.test.ts` | 7 tests for extractFile |
| `test/indexer-index-project.test.ts` | 3 tests for indexProject (2 original + 1 added this session) |
| `test/graph-store.test.ts` | 11 store unit tests |
| `test/graph-store-list-files.test.ts` | listFiles behaviour |

---

## Strengths

**`src/graph/sqlite.ts`**
- Clean SQL injection discipline (`src/graph/sqlite.ts:161-183`): `joinOn`/`whereField` are internal enum-derived constants documented as non-user-input; all real user values use `?` parameters.
- `deleteFile` correctly deletes edges touching the file from EITHER direction (source or target), preventing orphaned edges (`sqlite.ts:252-256`).
- Transaction wrapping for `deleteFile` (`sqlite.ts:246-268`) is correct; manual `BEGIN/COMMIT/ROLLBACK` is reliable.
- Composite primary key on `edges(source, target, kind, provenance_source)` naturally deduplicates at the DB layer in addition to the in-memory `edgeKeys` set in `extractFile`.
- Indexes on `nodes.file`, `edges.source`, `edges.target` — right choices for the expected query patterns.
- `schema_version` table + idempotent `CREATE TABLE IF NOT EXISTS` — proper migration foundation for future schema changes.

**`src/indexer/tree-sitter.ts`**
- Two-pass design (node walk, then call-edge walk) keeps each concern isolated and easy to reason about.
- `pushEdge` deduplication via in-memory `Set` prevents duplicate edges within a single file extraction, complementing the DB constraint.
- `hasError()` duck-typing (`tree-sitter.ts:95-98`) intentionally handles the tree-sitter API change from method to property across versions. Comment is present.
- Arrow function `end_line` correctly uses `valueNode.endPosition` (the arrow body end), not the `variable_declarator`'s end.

**`src/indexer/pipeline.ts`**
- `toPosixPath` normalisation ensures cross-platform consistency for relative file paths stored in the DB.
- Two-phase loop (index current files, then prune deleted files from `store.listFiles()`) correctly handles all incremental cases.
- Error isolation: `catch { errors++ }` in both loops prevents a single bad file from halting the run.

**Tests**
- `test/indexer-index-project.test.ts` creates and tears down real temp directories with `rmSync(..., { recursive: true })` — no test pollution.
- `chmod 0o000` trick for testing unreadable files is robust; permissions are restored before cleanup.
- All test assertions use concrete values (`toEqual`, `toContain`, `not.toContain`), not structure-only checks.

---

## Findings

### Critical
None.

### Important

**1. `unquoteStringLiteral` called on identifier node text (was a no-op — fixed)**
- `src/indexer/tree-sitter.ts` (pre-fix line 179)
- `import_specifier.name` in tree-sitter is always an `identifier` node — `.text` is a bare name like `"foo"`, never a quoted string. The call to `unquoteStringLiteral(nameNode.text)` was always the identity function for this input.
- **Why it mattered:** Confusing to future maintainers. Suggests names could be string literals, which they cannot be in TypeScript named import syntax. Also suggests the import *path* would be unquoted, which it isn't (the evidence field correctly preserves quotes in the raw source text).
- **Fix applied:** Replaced `const importedName = unquoteStringLiteral(nameNode.text)` with `const importedName = nameNode.text` and removed the unused `unquoteStringLiteral` function. Tests: 26 pass, 0 fail.

**2. Missing test for Criterion 23: changed file between runs (fixed)**
- `test/indexer-index-project.test.ts`
- No test exercised the code path where a file's hash changes between runs: `deleteFile(rel)` followed by re-extraction and storage.
- **Why it mattered:** The branch `if (existing !== null) { store.deleteFile(rel); }` in `pipeline.ts:60-62` was untested end-to-end. A regression that accidentally skips the `deleteFile` call on re-index would not have been caught.
- **Fix applied:** Added `"indexProject re-indexes a changed file: removes old nodes and stores new ones (criterion 23)"` test that: indexes `original()`, changes content to `changed()`, re-runs `indexProject`, and asserts (a) old function node is gone, (b) new function node is present, (c) stored hash matches new content. Tests: 26 pass, 0 fail.

### Minor

**3. `end_line: number | null` in `GraphNode` type, but never set to `null` by extractors**
- `src/graph/types.ts:40`
- The `addNode()` helper signature takes `endLine: number` (not `null`). Module nodes also always compute `countLines()`. The `null` case exists in the type for future flexibility (a symbol whose end line can't be determined) but nothing currently produces it.
- **Note for later:** If `null` is intentional future design, add a comment. If not, tighten to `end_line: number`.

**4. `.d.ts` files are indexed**
- `src/indexer/pipeline.ts:31` — `ent.name.endsWith(".ts")` also matches `.d.ts` declaration files.
- Declaration files in `src/` (common when hand-authoring ambient types) or `dist/types/` (generated by `tsc`) would be indexed. They contain type-only declarations; tree-sitter would produce only module nodes, no function/class nodes. Harmless for M0, but could cause surprising entries in the graph for projects with a `dist/` directory.
- **Note for later:** Add `.endsWith(".d.ts")` exclusion alongside `node_modules` if this becomes an issue.

**5. Silent error swallowing in `indexProject`**
- `src/indexer/pipeline.ts:70-72` — `catch { errors++; }` with no logging.
- Errors counter is returned in `IndexResult`, but callers have no way to know which files failed or why without adding their own instrumentation.
- **Note for later:** Add an optional `onError?: (file: string, err: unknown) => void` callback or emit to a logger when the logging story is established in M1/M2.

**6. `hasError` duck-typing is verbose**
- `src/indexer/tree-sitter.ts:95-98`
- The block handles the tree-sitter v0.20–v0.25 API change from `hasError()` (method) to `hasError` (property). Intentional, but the current version constraint is `^0.25.0` (pinned to the new API). The function-check branch is dead code for the locked version.
- **Note for later:** Once tree-sitter's TypeScript types stabilise, replace with direct property access `tree.rootNode.hasError`.

---

## Recommendations

1. **Add `.d.ts` exclusion in `walkTsFiles`** before M1 — if `tsc` output or ambient type files exist in the project root, they'll appear in the graph unnecessarily.

2. **Bun's `db.transaction()`** is available as a cleaner alternative to manual `BEGIN/COMMIT/ROLLBACK` for `deleteFile`. Not a bug, but idiomatic Bun SQLite style. Consider adopting for future transactional methods.

3. **Criterion 23 test coverage confirmed via fix** — the new test exercises the most important untested incremental path and gives confidence the hash-change branch works end-to-end.

---

## Test Results After Fixes

```
bun test v1.3.9 (cf6cdbbb)

 26 pass
 0 fail
 86 expect() calls
Ran 26 tests across 8 files. [173.00ms]
```

(+1 test, +7 assertions vs pre-review run of 25 tests / 79 assertions)

---

## Assessment

**ready**

Both Important findings were fixed in this session. The implementation is correct, well-structured, and consistent with codebase conventions. The graph store SQL is safe (parameterized queries, documented internal interpolations), the incremental pipeline handles all four cases (skip, re-index, delete, error), and the tree-sitter extraction handles all specified node and edge types. Minor findings are noted for future milestones and do not warrant blocking merge.
