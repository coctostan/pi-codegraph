# M1: Output Layer + `symbol_graph` Tool

**Issue:** 021 (closes #006, #007)
**Branch:** feat/021-m1-output-layer-symbol-graph-tool
**Milestone:** M1

---

## What Was Built

### `GraphStore.findNodes` — name-based symbol lookup

Added `findNodes(name: string, file?: string): GraphNode[]` to the `GraphStore` interface and `SqliteGraphStore` implementation. Supports:

- Global lookup: `findNodes("foo")` → all nodes named `foo` across all files
- Scoped lookup: `findNodes("foo", "src/a.ts")` → only nodes in that file

SQL uses parameterized queries with two variants (with/without `AND file = ?`) — no string concatenation, no injection surface.

**Files:** `src/graph/store.ts`, `src/graph/sqlite.ts`

---

### `computeAnchor` — hashline anchoring

`computeAnchor(node, projectRoot): { anchor: string; stale: boolean }`

Given a graph node, reads the file at `path.join(projectRoot, node.file)` and produces a `file:line:hash` string where:
- `hash` = first 4 hex chars of SHA-256 of the **trimmed** line content
- Compatible with pi's edit tool anchor format

Staleness detection:
- File missing → `anchor = "src/foo.ts:42:?"`, `stale = true`
- File exists but full-file SHA-256 differs from `node.content_hash` → `stale = true`, anchor still produced from current content
- File matches → `stale = false`
- Line index out-of-bounds (file shorter than `start_line`) → `anchor = "...:?"`, `stale = true`

**File:** `src/output/anchoring.ts`

---

### `rankNeighbors` — confidence-based ranking

`rankNeighbors(neighbors, limit): { kept: NeighborResult[]; omitted: number }`

- Sorts by `edge.provenance.confidence` descending
- Breaks ties by `edge.created_at` descending (newer wins)
- Truncates to `limit`; `omitted` reports how many were dropped
- Non-mutating (spreads input before sorting)

**File:** `src/output/anchoring.ts`

---

### `formatNeighborhood` — plain-text output formatter

`formatNeighborhood(symbol, callers, callees, imports, unresolved): string`

Produces a plain-text block suitable for agent consumption:

```
## myFunc (function)
src/a.ts:10:abcd

### Callers
  src/b.ts:5:1234  caller1  calls  confidence:0.9  tree-sitter

### Callees
  src/c.ts:20:5678  callee1  calls  confidence:0.5  tree-sitter [stale]
  (3 more omitted)

### Unresolved
  __unresolved__::Parser:0:?  Parser  calls  confidence:0.5  tree-sitter [stale]
```

Rules:
- Empty sections are fully omitted (no empty headers)
- Stale entries suffixed with `[stale]`
- `(N more omitted)` appears when a section was truncated

**File:** `src/output/anchoring.ts`

---

### `symbolGraph` — the tool

`symbolGraph({ name, file?, limit?, store, projectRoot }): string`

| Input | Output |
|-------|--------|
| Name matches 0 nodes | `Symbol "X" not found` |
| Name matches >1 nodes, no `file` | Disambiguation list with anchor, kind, file per entry |
| Name + `file` matches exactly 1 | Full formatted neighborhood |
| Name matches exactly 1 | Full formatted neighborhood |

Neighbor categorization:
- **Callers** — incoming `calls` edges (`edge.target === node.id`)
- **Callees** — outgoing `calls` edges (`edge.source === node.id`)
- **Imports** — outgoing `imports` edges only (`edge.source === node.id`)
- **Unresolved** — nodes whose `file` starts with `__unresolved__`

Each category is independently ranked and truncated to `limit` (default: 10).

**File:** `src/tools/symbol-graph.ts`

---

## Code Review Fix

During code review, an incoming-`imports` direction bug was found and fixed:

**Bug:** `symbolGraph` placed all `imports` edges (both directions) into the `Imports` section. When symbol B is imported by A, querying B would show A in B's `Imports` section — semantically backwards.

**Fix:** Added `&& nr.edge.source === node.id` guard so only outgoing imports are included.

**Tests added:** Two new regression tests — one confirming incoming imports are excluded, one confirming outgoing imports are shown.

Also removed the dead `anchorResults()` no-op export (M0 scaffolding artifact) and updated the scaffold smoke-test to check a real export.

---

## Test Coverage

| Test file | What it tests |
|-----------|---------------|
| `test/graph-store-find-nodes.test.ts` | `findNodes` — all-files, empty, file-filtered |
| `test/output-compute-anchor.test.ts` | `computeAnchor` — fresh, stale, missing file |
| `test/output-rank-neighbors.test.ts` | `rankNeighbors` — sorting, truncation, tie-breaking |
| `test/output-format-neighborhood.test.ts` | `formatNeighborhood` — header, sections, omissions, stale, unresolved |
| `test/tool-symbol-graph.test.ts` | `symbolGraph` — not-found, disambiguation, file filter, truncation, imports direction |

**Final count:** 46 tests, 0 fail, `tsc --noEmit` clean.
