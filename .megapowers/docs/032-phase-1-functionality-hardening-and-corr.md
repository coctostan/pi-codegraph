# Bugfix Summary — Phase 1 Functionality Hardening (#032)

Addresses three independent bugs found during real tool-call testing: stale persisted graph data, inconsistent ambiguous-symbol handling across tools, and `graph_query` single-quote rejection.

---

## Bug 1: Stale Persisted Graph Not Refreshed (#029)

### Root Cause
`ensureIndexed()` in `src/index.ts` gated indexing on `store.listFiles().length === 0`. Any non-empty `.codegraph/graph.db` — even one built from an older source snapshot — was treated as authoritative. Changed, added, or removed files were never detected.

### Fix
Removed the emptiness guard. `ensureIndexed()` now calls `indexProject()` unconditionally on every tool invocation. `indexProject()` is already incremental: it computes a SHA-256 hash of each source file, compares it to the stored hash, and only re-indexes files that changed.

```ts
// before
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (store.listFiles().length === 0) {
    await indexProject(projectRoot, store);
  }
}

// after
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  await indexProject(projectRoot, store);
}
```

### Files Changed
- `src/index.ts` — removed `listFiles()` gate in `ensureIndexed()`
- `test/extension-stale-db-refresh.test.ts` — new regression test

### How to Verify
```bash
bun test test/extension-stale-db-refresh.test.ts
# (pass) extension refreshes a persisted stale graph before symbol_graph responds
```

---

## Bug 2: Inconsistent Ambiguous Symbol Handling (#030)

### Root Cause
Each tool had its own ad hoc logic for the case where `store.findNodes(name)` returns more than one node:
- `symbol_graph` and `resolve_edge`: returned an explicit disambiguation list ✅
- `trace`: collapsed `>1` matches into the same "not found" message as `0` matches ❌
- `impact`: silently seeded traversal from *all* matching nodes, broadening scope without warning ❌

### Fix
Extracted a shared `resolveUniqueSymbol()` helper into `src/tools/symbol-resolution.ts`. It returns a tagged union: `not_found | ambiguous | unique`. Both `trace` and `impact` now use it and surface the `ambiguous` text immediately.

### Files Changed
- `src/tools/symbol-resolution.ts` — new shared resolver (`resolveUniqueSymbol`, `formatAmbiguousMatches`)
- `src/tools/trace.ts` — replaced private `resolveNode()` with `resolveUniqueSymbol()`
- `src/tools/impact.ts` — added per-symbol ambiguity check before running `collectImpact()`
- `test/tool-trace-ambiguous.test.ts` — new regression test
- `test/tool-impact-ambiguous.test.ts` — new regression test

### How to Verify
```bash
bun test test/tool-trace-ambiguous.test.ts test/tool-impact-ambiguous.test.ts
# (pass) trace returns a disambiguation list when entry matches multiple symbols
# (pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches
```

---

## Bug 3: `graph_query` Rejects Single-Quoted WHERE Literals (#031)

### Root Cause
`parseWhere()` in `src/tools/graph-query-parser.ts` matched only double-quoted RHS values:
```ts
.match(/^alias\.property\s*=\s*"([^"]+)"$/)
```
Single-quoted Cypher-style strings like `n.name = 'GraphStore'` were rejected with `parse_error: invalid WHERE predicate`.

### Fix
Extended the regex to accept either double or single quotes, using a non-capturing alternation:
```ts
.match(/^...\s*=\s*(?:"([^"]+)"|'([^']+)')$/)
// value: match[3] ?? match[4]!
```

### Files Changed
- `src/tools/graph-query-parser.ts` — `parseWhere()` regex extended
- `test/tool-graph-query-single-quote-where.test.ts` — new regression test

### How to Verify
```bash
bun test test/tool-graph-query-single-quote-where.test.ts
# (pass) graphQuery accepts a single-quoted equality predicate in WHERE
```

---

## Overall Test Results
```
198 pass, 0 fail
594 expect() calls
Ran 198 tests across 83 files.
```
