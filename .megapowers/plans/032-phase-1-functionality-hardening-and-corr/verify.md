# Verification Report — Issue 032

## Test Suite Results

```
bun test
198 pass
0 fail
594 expect() calls
Ran 198 tests across 83 files. [7.02s]
```

All tests pass with zero failures.

---

## Original Bug Reproduction (Bugfix Verification)

### Issue #029 — stale persisted graph
**Symptom to eliminate:** `symbol_graph(GraphStore, file: src/graph/store.ts)` returns
`src/graph/store.ts:13:... [stale]` when a non-empty `.codegraph/graph.db` exists with outdated data.

**Reproduction test:** `test/extension-stale-db-refresh.test.ts`
- Test uses `cpSync` to clone `src/` into a tmpdir, runs `symbol_graph` once (indexing), then prepends 3 lines to `src/graph/store.ts` (shifting all declarations by +3 lines), resets the store singleton, and invokes `symbol_graph` again.
- Assertions: result **contains** `src/graph/store.ts:33:` (updated anchor) and does **not contain** `[stale]`.

```
bun test test/extension-stale-db-refresh.test.ts
1 pass, 0 fail
(pass) extension refreshes a persisted stale graph before symbol_graph responds [1600ms]
```

The bug no longer occurs.

### Issue #030 — ambiguous symbols
**Symptom to eliminate:** `trace(entry: "sha256Hex")` returns `Entry "sha256Hex" not found` instead of a disambiguation message.

**Reproduction test:** `test/tool-trace-ambiguous.test.ts`
- Two nodes both named `sha256Hex` are inserted; `trace({ entry: "sha256Hex", ... })` is called.
- Assertions: output contains `Multiple matches for "sha256Hex"`, contains anchors for both files, does **not** contain `Entry "sha256Hex" not found`.

**Symptom to eliminate:** `impact(symbols: ["sha256Hex"], changeType: "signature_change")` silently aggregates all matches.

**Reproduction test:** `test/tool-impact-ambiguous.test.ts`
- Two nodes named `sha256Hex` with a caller edge; `impact(...)` is called.
- Assertions: output contains `Multiple matches for "sha256Hex"` and does **not** contain `caller  breaking  depth:1`.

```
bun test test/tool-trace-ambiguous.test.ts test/tool-impact-ambiguous.test.ts
2 pass, 0 fail
```

Both bugs no longer occur.

### Issue #031 — single-quoted WHERE predicate
**Symptom to eliminate:** `MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name` → `parse_error: invalid WHERE predicate: n.name = 'GraphStore'`

**Direct reproduction** (run inline with bun):
```
Single-quote query result: "rows: 1\nrow 1\n  n.name: GraphStore\n"
Contains rows: 1 ? true
Contains n.name: GraphStore ? true
```

**Regression test:** `test/tool-graph-query-single-quote-where.test.ts`
```
bun test test/tool-graph-query-single-quote-where.test.ts
1 pass, 0 fail
(pass) graphQuery accepts a single-quoted equality predicate in WHERE [4.44ms]
```

The bug no longer occurs.

---

## Per-Criterion Verification

### Criterion 1: Tool invocation no longer relies on `store.listFiles().length === 0` as the only indexing gate; persisted stale graphs are detected before serving results.

**Evidence — code inspection:**
```bash
grep -n "listFiles" src/index.ts
# (no output — exit code 1)
```
The `listFiles().length === 0` guard was removed. `ensureIndexed()` now calls `indexProject()` unconditionally on every tool invocation (src/index.ts:77-79):
```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  await indexProject(projectRoot, store);
}
```
`indexProject()` already implements incremental change detection internally (src/indexer/pipeline.ts:73-89): it compares file hashes and only re-indexes changed, added, or removed files.

**Verdict:** ✅ pass

---

### Criterion 2: With an existing stale `.codegraph/graph.db`, invoking `symbol_graph` or `trace` returns anchors for the current source state rather than stale old line numbers.

**Evidence — regression test:**
```
bun test test/extension-stale-db-refresh.test.ts
(pass) extension refreshes a persisted stale graph before symbol_graph responds [1600ms]
1 pass, 0 fail
```
Test proves: after source files are shifted by 3 lines and the store singleton is reset (simulating stale DB reuse), `symbol_graph` returns `src/graph/store.ts:33:` (updated anchor) without a `[stale]` marker.

**Verdict:** ✅ pass

---

### Criterion 3: Ambiguous symbol names are handled consistently across `symbol_graph`, `resolve_edge`, `trace`, and `impact`, with explicit semantics for the multi-match case.

**Evidence — shared resolver:**
```bash
grep -n "resolveUniqueSymbol" src/tools/trace.ts src/tools/impact.ts src/tools/symbol-resolution.ts
# src/tools/trace.ts:3:  import { resolveUniqueSymbol } from "./symbol-resolution.js";
# src/tools/trace.ts:74: const resolved = resolveUniqueSymbol({...});
# src/tools/impact.ts:3:  import { resolveUniqueSymbol } from "./symbol-resolution.js";
# src/tools/impact.ts:80: const resolved = resolveUniqueSymbol({...});
# src/tools/symbol-resolution.ts:20: export function resolveUniqueSymbol(...)
# src/tools/symbol-resolution.ts:32: return { kind: "ambiguous", text: formatAmbiguousMatches(...) }
```
`trace` and `impact` both delegate to the shared `resolveUniqueSymbol()`. It returns `{ kind: "ambiguous", text: ... }` for multiple matches, which both callers return immediately. `symbol_graph` and `resolve_edge` retain their existing (already-correct) disambiguation behavior.

**Evidence — tests:**
```
bun test test/tool-trace-ambiguous.test.ts test/tool-impact-ambiguous.test.ts
2 pass, 0 fail
(pass) trace returns a disambiguation list when entry matches multiple symbols
(pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches
```

**Verdict:** ✅ pass

---

### Criterion 4: `graph_query(query: "MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name")` succeeds.

**Evidence — direct execution:**
```
bun -e "... graphQuery({ query: \"MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name\", ... })"
Single-quote query result: "rows: 1\nrow 1\n  n.name: GraphStore\n"
Contains rows: 1 ? true
Contains n.name: GraphStore ? true
```

**Evidence — parser implementation** (src/tools/graph-query-parser.ts:154):
```ts
.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]+)"|'([^']+)')$/);
```
The regex now accepts both `"double"` and `'single'` quoted values. `match[3] ?? match[4]!` extracts the value from whichever capture group matched.

**Evidence — regression test:**
```
bun test test/tool-graph-query-single-quote-where.test.ts
(pass) graphQuery accepts a single-quoted equality predicate in WHERE [4.44ms]
1 pass, 0 fail
```

**Verdict:** ✅ pass

---

### Criterion 5: Regression tests cover persisted stale DB refresh, ambiguity handling for `trace` and `impact`, and single-quoted `WHERE` parsing.

**Evidence — new test files:**

| Test file | Covers |
|---|---|
| `test/extension-stale-db-refresh.test.ts` | Stale DB refresh (AC 1 & 2) |
| `test/tool-trace-ambiguous.test.ts` | `trace` ambiguity disambiguation (AC 3) |
| `test/tool-impact-ambiguous.test.ts` | `impact` ambiguity rejection (AC 3) |
| `test/tool-graph-query-single-quote-where.test.ts` | Single-quoted WHERE (AC 4) |

All four files are new (confirmed in `git status --porcelain` as `??` untracked, i.e. newly created for this issue). All pass in the full 198-test run.

**Verdict:** ✅ pass

---

## Overall Verdict

**pass**

All 5 acceptance criteria are met:
1. `ensureIndexed()` calls `indexProject()` unconditionally — no `listFiles()` gate remains.
2. Regression test proves stale anchors are corrected before results are returned.
3. `trace` and `impact` both use shared `resolveUniqueSymbol()` and explicitly return disambiguation text for multi-match symbols.
4. `MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name` returns `rows: 1` — confirmed via direct execution and passing regression test.
5. Four new regression tests cover all three bugs. Full suite: 198 pass, 0 fail.
