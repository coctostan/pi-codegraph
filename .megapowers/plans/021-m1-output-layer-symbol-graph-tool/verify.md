# Verification Report: 021-m1-output-layer-symbol-graph-tool

## Test Suite Results

```
bun test v1.3.9 (cf6cdbbb)

 44 pass
 0 fail
 151 expect() calls
Ran 44 tests across 13 files. [65.00ms]
---EXIT:0
```

TypeScript check:
```
$ tsc --noEmit
test/graph-types.typecheck.ts(59,7): error TS2739:
  Type '{ addNode: () => void; addEdge: () => void; getNode: () => null;
         getNeighbors: () => never[]; getNodesByFile: () => never[];
         deleteFile: () => void; getFileHash: () => null; setFileHash: () => void;
         close: () => void; }'
  is missing the following properties from type 'GraphStore': findNodes, listFiles
---EXIT:2
```

---

## Per-Criterion Verification

### Criterion 1: `GraphStore` interface exposes `findNodes(name: string, file?: string): GraphNode[]`
**Evidence:**
- `src/graph/store.ts` line 17: `findNodes(name: string, file?: string): GraphNode[];` — method is present in the interface.
- `SqliteGraphStore.findNodes` implemented at `src/graph/sqlite.ts` lines 150–178.
- `bun test` passes (including `test/graph-store-find-nodes.test.ts`).
- **HOWEVER:** `bun run check` (`tsc --noEmit`) exits 2 with error in `test/graph-types.typecheck.ts` line 59: the `validStore` mock object (which is typed as `GraphStore`) is missing both `findNodes` and `listFiles`. The mock was not updated when those methods were added to the interface.

**Verdict:** **partial** — interface and implementation are correct, but `tsc --noEmit` fails because `test/graph-types.typecheck.ts` mock was not updated.

---

### Criterion 2: `findNodes("foo")` returns all nodes where `name = "foo"` across all files
**Evidence:** `test/graph-store-find-nodes.test.ts` lines 4–45:
- Inserts `foo` in `src/a.ts` and `src/b.ts`, plus `bar` in `src/a.ts`.
- `store.findNodes("foo")` → `toHaveLength(2)` with both IDs.
- **Test passes** (44 pass, 0 fail).

**Verdict:** pass

---

### Criterion 3: `findNodes("foo", "src/a.ts")` returns only nodes where `name = "foo"` and `file = "src/a.ts"`
**Evidence:** `test/graph-store-find-nodes.test.ts` lines 55–83:
- Inserts `foo` in both files.
- `store.findNodes("foo", "src/a.ts")` → `toHaveLength(1)`, result id = `"src/a.ts::foo:1"`.
- SQL in `src/graph/sqlite.ts` line 152–155 uses `WHERE name = ? AND file = ?` when `file` is provided.
- **Test passes.**

**Verdict:** pass

---

### Criterion 4: `findNodes("nonexistent")` returns an empty array
**Evidence:** `test/graph-store-find-nodes.test.ts` lines 47–52:
- Empty store, `findNodes("nonexistent")` → `toEqual([])`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 5: `computeAnchor(node, projectRoot)` returns `{ anchor, stale }` where `anchor` is `file:line:hash` format
**Evidence:** `test/output-compute-anchor.test.ts` lines 12–40:
- Writes `"line one\nexport function foo() {}\nline three"` to a temp file.
- Node with `start_line: 2`, content_hash = SHA-256 of file.
- `result.anchor` → `src/a.ts:2:${lineHash}` (matches `file:line:hash` format).
- **Test passes.**
- Implementation at `src/output/anchoring.ts` lines 16–47.

**Verdict:** pass

---

### Criterion 6: Hash portion is first 4 hex characters of SHA-256 of line content (trimmed)
**Evidence:** `test/output-compute-anchor.test.ts` lines 21–22:
- `lineContent = "export function foo() {}"` (pre-trimmed), `lineHash = sha256Hex(lineContent.trim()).slice(0, 4)`.
- Asserts `result.anchor === \`src/a.ts:2:${lineHash}\``.
- Implementation `src/output/anchoring.ts` line 40–41: `lines[lineIndex]!.trim()` → `sha256Hex(...).slice(0, 4)`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 7: File exists but content hash differs → `stale: true`
**Evidence:** `test/output-compute-anchor.test.ts` lines 43–73:
- Writes modified file content but node has hash of original content.
- `result.stale` → `true`; still produces valid anchor from current file.
- Implementation `src/output/anchoring.ts` line 28: `const stale = currentHash !== node.content_hash`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 8: File does not exist → `stale: true` and anchor uses `?` as hash
**Evidence:** `test/output-compute-anchor.test.ts` lines 76–96:
- Node references `src/gone.ts` which is never written.
- `result.anchor === "src/gone.ts:5:?"` and `result.stale === true`.
- Implementation `src/output/anchoring.ts` lines 19–24: `existsSync` check, returns `anchor: \`${node.file}:${node.start_line}:?\`` with `stale: true`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 9: File exists and content hash matches → `stale: false`
**Evidence:** `test/output-compute-anchor.test.ts` lines 12–40:
- File written with exact same content used to compute `contentHash`.
- `result.stale === false`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 10: `rankNeighbors(neighbors, limit)` returns `{ kept, omitted }` sorted by confidence descending
**Evidence:** `test/output-rank-neighbors.test.ts` lines 31–47:
- 5 neighbors with confidences 0.3, 0.9, 0.5, 0.5, 1.0. `limit=3`.
- `kept[0].node.name === "top"` (1.0), `kept[1].node.name === "high"` (0.9), `kept[2]` confidence 0.5.
- Implementation `src/output/anchoring.ts` lines 54–68: sorts by `b.edge.provenance.confidence - a.edge.provenance.confidence`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 11: Input > limit → top `limit` items kept, `omitted` = remainder
**Evidence:** Same test (lines 31–47):
- 5 items, limit 3 → `kept.length === 3`, `omitted === 2`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 12: Input ≤ limit → all items kept, `omitted === 0`
**Evidence:** `test/output-rank-neighbors.test.ts` lines 66–78:
- 2 items, limit 10 → `kept.length === 2`, `omitted === 0`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 13: Ties broken by `edge.created_at` descending (newer first)
**Evidence:** `test/output-rank-neighbors.test.ts` lines 50–63:
- 3 neighbors all confidence 0.5, `created_at` 1000, 2000, 3000.
- `kept[0]` = "newest" (3000), `kept[1]` = "newer" (2000), `kept[2]` = "older" (1000).
- Implementation `src/output/anchoring.ts` line 59: `b.edge.created_at - a.edge.created_at`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 14: Formatter produces header line showing symbol name, kind, and anchor
**Evidence:** `test/output-format-neighborhood.test.ts` lines 13–79:
- `output` contains `"myFunc (function)"` and `"src/a.ts:10:abcd"`.
- Implementation `src/output/anchoring.ts` line 119: `## ${symbol.name} (${symbol.kind})\n${symbol.anchor.anchor}`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 15: Neighbor entries grouped into sections: Callers, Callees, Imports
**Evidence:** `test/output-format-neighborhood.test.ts`:
- Test at lines 13–79: checks `output.toContain("Callers")` and `output.toContain("Callees")`.
- Test at lines 82–111: `omitted` section shows `(5 more omitted)`.
- Implementation `src/output/anchoring.ts` lines 121–128: `formatSection("Callers", ...)`, `formatSection("Callees", ...)`, `formatSection("Imports", ...)`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 16: Each neighbor entry line includes: anchor, symbol name, edge kind, confidence, and provenance source
**Evidence:** `test/output-format-neighborhood.test.ts` lines 13–79:
- Checks: `output.toContain("src/b.ts:5:1234")`, `"caller1"`, `"0.9"`, `"tree-sitter"`.
- Implementation `src/output/anchoring.ts` line 100: `` `  ${item.anchor.anchor}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}` ``.
- **Test passes.**

**Verdict:** pass

---

### Criterion 17: Truncated category shows `(N more omitted)` after last entry
**Evidence:** `test/output-format-neighborhood.test.ts` lines 82–111:
- `callers.omitted = 5` → `output.toContain("(5 more omitted)")`.
- Implementation `src/output/anchoring.ts` lines 104–106: `if (section.omitted > 0) lines.push(\`  (${section.omitted} more omitted)\`)`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 18: Empty neighbor categories are omitted entirely (no empty section headers)
**Evidence:** `test/output-format-neighborhood.test.ts` lines 13–79:
- `imports = { items: [], omitted: 0 }` → `output.not.toContain("Imports")`.
- Implementation `src/output/anchoring.ts` line 90–92: `if (section.items.length === 0 && section.omitted === 0) return ""` + line 127: `.filter((s) => s.length > 0)`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 19: Stale entries are suffixed with `[stale]`
**Evidence:** `test/output-format-neighborhood.test.ts` lines 114–156:
- Entry with `stale: true` → line contains `"[stale]"`.
- Entry with `stale: false` → line does not contain `"[stale]"`.
- Implementation `src/output/anchoring.ts` line 98–100: `const staleMarker = item.anchor.stale ? " [stale]" : ""`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 20: Unresolved nodes (file starts with `__unresolved__`) grouped into `Unresolved` section
**Evidence:** `test/output-format-neighborhood.test.ts` lines 159–189:
- `unresolved` section with node name `"Parser"` and anchor `"__unresolved__::Parser:0:?"`.
- `output.toContain("Unresolved")` and `output.toContain("Parser")`.
- Implementation `src/tools/symbol-graph.ts` lines 71–74: `if (nr.node.file.startsWith("__unresolved__")) unresolvedResults.push(nr)`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 21: `symbolGraph({ name, file?, limit? })` with exactly one match → full formatted neighborhood
**Evidence:** `test/tool-symbol-graph.test.ts` lines 27–72:
- Single `foo` node; calls `symbolGraph({ name: "foo", store, projectRoot })`.
- Output contains `"foo (function)"`, `"src/a.ts:3:"`, `"Callees"`, `"bar"`, `"0.5"`, `"tree-sitter"`.
- No `"Callers"` section (no callers).
- **Test passes.**

**Verdict:** pass

---

### Criterion 22: Zero matches → text containing "not found"
**Evidence:** `test/tool-symbol-graph.test.ts` lines 75–90:
- Empty store, `symbolGraph({ name: "doesNotExist", ... })`.
- `output.toContain("not found")` and `output.toContain("doesNotExist")`.
- Implementation `src/tools/symbol-graph.ts` line 47: `return \`Symbol "${name}" not found\``.
- **Test passes.**

**Verdict:** pass

---

### Criterion 23: Multiple matches, no `file` filter → disambiguation list with anchor, kind, file per entry
**Evidence:** `test/tool-symbol-graph.test.ts` lines 93–126:
- Two `foo` nodes: `src/a.ts` (function) and `src/b.ts` (class).
- `output.toContain("Multiple matches")`, `"src/a.ts"`, `"src/b.ts"`, `"function"`, `"class"`.
- Does NOT contain `"Callers"` or `"Callees"`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 24: `name` + `file` filter narrowing to one match → full formatted neighborhood
**Evidence:** `test/tool-symbol-graph.test.ts` lines 128–156:
- Two `foo` nodes; `symbolGraph({ name: "foo", file: "src/a.ts", store, projectRoot })`.
- Output contains `"foo (function)"` and `"src/a.ts:3:"`, does NOT contain `"Multiple matches"`.
- Implementation `src/tools/symbol-graph.ts` line 44: `store.findNodes(name, file)` → filtered to 1 result.
- **Test passes.**

**Verdict:** pass

---

### Criterion 25: Callers = incoming `calls` edges; callees = outgoing `calls` edges; imports = outgoing `imports` edges
**Evidence:** `src/tools/symbol-graph.ts` lines 70–85:
- `nr.edge.kind === "calls"` + `nr.edge.target === node.id` → callerResults
- `nr.edge.kind === "calls"` + `nr.edge.target !== node.id` → calleeResults
- `nr.edge.kind === "imports"` → importResults
- `test/tool-symbol-graph.test.ts` lines 43–50: edge added as `source: "src/a.ts::foo:3"`, `target: "src/b.ts::bar:1"`, kind `"calls"` → confirmed in output as `"Callees"` with `"bar"`.
- **Test passes.**

**Verdict:** pass

---

### Criterion 26: Each neighbor category independently ranked and truncated to `limit` (default: 10)
**Evidence:** `test/tool-symbol-graph.test.ts` lines 159–197:
- 3 callees added with descending confidence. `limit: 2`.
- Output contains `"callee0"`, `"callee1"`, `"(1 more omitted)"`.
- Does NOT contain `"callee2"`.
- Implementation `src/tools/symbol-graph.ts` lines 87–90: each category calls `buildSection(... limit ...)` independently.
- **Test passes.**

**Verdict:** pass

---

## TypeScript Check Issue

`bun run check` exits with code 2:
```
test/graph-types.typecheck.ts(59,7): error TS2739:
  Type '{ addNode...; close: () => void; }' is missing the following properties
  from type 'GraphStore': findNodes, listFiles
```

**Root cause:** `test/graph-types.typecheck.ts` contains a `validStore` mock at line 59 that was not updated when `findNodes` (criterion 1) and `listFiles` were added to the `GraphStore` interface. The mock has 9 entries (matching the comment at line 71: "all 9 methods") but the interface now requires 11. The fix is to add `findNodes: () => []` and `listFiles: () => []` to the mock object and update the comment.

---

## Fix Applied During Verify

During verify, `bun run check` (tsc --noEmit) failed because `test/graph-types.typecheck.ts` had a stale `validStore` mock (9 methods) missing `findNodes` and `listFiles` (now 11 methods on `GraphStore`). Phase backed to implement; added both methods to the mock, updated the comment to "11 methods". Post-fix re-run:

```
bun test  →  44 pass, 0 fail, EXIT:0
bun run check (tsc --noEmit)  →  EXIT:0
```

## Overall Verdict

**pass**

All 26 acceptance criteria satisfied. 44 unit tests pass (0 fail). `tsc --noEmit` exits 0. Implementation covers: `GraphStore.findNodes`, `SqliteGraphStore`, `computeAnchor`, `rankNeighbors`, `formatNeighborhood`, and the `symbolGraph` tool — disambiguation, staleness, unresolved sections, and per-category truncation all verified.
