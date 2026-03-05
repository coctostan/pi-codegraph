# Code Review: 021-m1-output-layer-symbol-graph-tool

## Files Reviewed

| File | Change |
|------|--------|
| `src/graph/store.ts` | Added `findNodes(name, file?)` to `GraphStore` interface |
| `src/graph/sqlite.ts` | Implemented `SqliteGraphStore.findNodes` |
| `src/output/anchoring.ts` | New: `computeAnchor`, `rankNeighbors`, `formatNeighborhood`, shared output types |
| `src/tools/symbol-graph.ts` | New: `symbolGraph` tool — disambiguation, neighborhood formatting |
| `test/graph-types.typecheck.ts` | Updated mock to include `findNodes` + `listFiles` |
| `test/graph-store-find-nodes.test.ts` | New: `findNodes` unit tests |
| `test/output-compute-anchor.test.ts` | New: `computeAnchor` unit tests |
| `test/output-rank-neighbors.test.ts` | New: `rankNeighbors` unit tests |
| `test/output-format-neighborhood.test.ts` | New: `formatNeighborhood` unit tests |
| `test/tool-symbol-graph.test.ts` | New: end-to-end `symbolGraph` tool tests |

---

## Strengths

- **`computeAnchor` out-of-bounds guard** (`anchoring.ts:33–38`): correctly returns `stale:true` with `?` hash when `start_line` exceeds the file's line count — handles a subtle case not in the spec.

- **Non-mutating sort** (`anchoring.ts:55`): `rankNeighbors` spreads the input before sorting (`[...neighbors].sort(...)`) — callers' arrays are not modified.

- **Confidence + timestamp tie-breaking** (`anchoring.ts:56–59`): clean two-key sort matching spec criterion 13 exactly.

- **Empty-section suppression** (`anchoring.ts:90–92`, `127`): zero-length sections are filtered at the `formatSection` level, not at the call site — single place to change.

- **`findNodes` SQL** (`sqlite.ts:151–155`): the two-branch conditional (with/without file) avoids building SQL via string concatenation and keeps both queries parameterized — no injection risk.

- **Test isolation**: all file-system tests use a fresh `tmpdir` with a unique `Date.now()` suffix and clean up in `finally`. Store tests use in-memory SQLite (no file).

- **End-to-end tool tests** (`tool-symbol-graph.test.ts`): test the real `SqliteGraphStore` rather than mocking the store interface — catches real SQL behavior including edge direction, not just interface compliance.

---

## Findings

### Critical
None.

### Important

**`imports` edge direction not filtered — fixed**
- `src/tools/symbol-graph.ts:82` (pre-fix)
- Incoming `imports` edges (things that import the queried symbol) were placed into `importResults` alongside outgoing imports. Spec criterion 25 says "imports by **outgoing** `imports` edges." With the original code, querying symbol `bar` when something else imported `bar` would show that importer in `bar`'s `Imports` section — semantically wrong.
- **Fix applied**: changed `else if (nr.edge.kind === "imports")` to `else if (nr.edge.kind === "imports" && nr.edge.source === node.id)`. Two new tests added to pin both sides of the contract (incoming excluded, outgoing included).
- **Tests**: 46 pass, 0 fail post-fix. `tsc --noEmit` clean.

### Minor

**Dead `anchorResults` export — fixed**
- `src/output/anchoring.ts:133` (pre-fix)
- `export function anchorResults(): void {}` — empty no-op function, left over from M0 scaffolding. Violates YAGNI; every future reader has to determine it does nothing.
- **Fix applied**: removed the function. Updated the scaffold smoke-test `test/output-anchoring.test.ts` to check for `computeAnchor` (the real primary export) instead.

**`require()` for `sha256Hex` in integration tests**
- `test/tool-symbol-graph.test.ts:32, 98, 133, 164`
- Tests use `const { sha256Hex } = require("../src/indexer/tree-sitter.js")` to compute content hashes for node fixtures. This creates a cross-layer test dependency (tool tests → indexer internals), and bypasses TypeScript module resolution. The same hash is available via `node:crypto` directly in two lines.
- **Not fixed** — tests work and `sha256Hex` is a genuine export on the indexer module; changing it touches multiple test files without clear benefit at this milestone. Recommend addressing in a cleanup pass.

**Row-mapping duplication in `sqlite.ts`**
- `sqlite.ts:140–147`, `169–177`, `264–272`
- The `{id, kind, name, file, start_line, end_line, content_hash}` row-to-`GraphNode` mapping appears three times across `getNode`, `findNodes`, and `getNodesByFile`. Pre-existing pattern; `findNodes` follows the established convention. Extract a `rowToGraphNode` helper in a future refactor.
- **Not fixed** — pre-existing debt, not introduced by this PR.

---

## Recommendations

1. **Add a `direction` filter on `getNeighbors` call in `symbolGraph`** (future): currently `getNeighbors(node.id)` fetches all edges both ways and then filters in application code. For large graphs this means fetching and discarding half the rows. Passing `direction: "out"` for callees/imports and `direction: "in"` for callers is a natural follow-up.

2. **`formatNeighborhood` always requires all four section parameters** — consider making `unresolved` optional with a default `{ items: [], omitted: 0 }` once the API stabilizes, to reduce noise at call sites.

3. **Confidence display format**: confidence is rendered as a raw float (`confidence:0.5`). Consider fixing precision to 2 decimal places (`toFixed(2)`) to avoid ugly floating-point representations in edge cases.

---

## Assessment

**ready**

All 26 spec criteria are met. Two findings were fixed in this session:
1. **`imports` direction bug** — incoming imports no longer appear in the `Imports` section; two new regression tests added.
2. **Dead `anchorResults` export** — removed; scaffold test updated to check a real export.

Post-fix: **46 tests pass (0 fail)**, `tsc --noEmit` exits 0.
