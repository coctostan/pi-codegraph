# Revise Instructions — Plan Iteration 4

## Task 4: Add eager LSP resolution stage for unresolved and confirmed call edges

### Bug — Step 1 + Step 3: `mkStore()` does not call `setFileHash`, so `listFiles()` always returns `[]` in every Task 4 test — the AC20 "confirmed" path is never exercised and the test **will fail at runtime**.

**Root cause:**

`runLspIndexStage` collects `confirmed` (non-unresolved tree-sitter calls edges) by iterating `store.listFiles()`:

```typescript
const confirmed: GraphEdge[] = [];
for (const file of store.listFiles()) {           // ← queries file_hashes table
  for (const node of store.getNodesByFile(file)) {
    for (const e of store.getEdgesBySource(node.id)) {
      if (e.kind === "calls" && e.provenance.source === "tree-sitter" && !isUnresolvedTarget(e.target)) {
        confirmed.push(e);
      }
    }
  }
}
```

`listFiles()` is implemented as:
```typescript
listFiles(): string[] {
  return this.db
    .query("SELECT file FROM file_hashes ORDER BY file ASC")
    .all() as Array<{ file: string }>;
}
```

`mkStore()` only calls `store.addNode()` — it never calls `store.setFileHash()`. So `listFiles()` returns `[]`, `confirmed` is empty, `work = [...unresolved, ...confirmed]` never includes the resolved tree-sitter edge from the AC20 test. The test fails:

```
expect(lsp).toHaveLength(1);   // FAILS — 0 lsp edges created
expect(ts).toHaveLength(0);    // passes (nothing happened)
```

Every other existing test that touches `listFiles()` (e.g., `test/tool-resolve-edge.test.ts`, `test/tool-symbol-graph-stale-agent.test.ts`) calls `setFileHash` explicitly. Task 4 was the only place that missed it.

**Fix — update `mkStore()` in Step 1 to call `setFileHash` for both fixture files:**

```typescript
function mkStore() {
  const store = new SqliteGraphStore();

  const caller = {
    id: "src/a.ts::caller:1",
    kind: "function" as const,
    name: "caller",
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "h-a",
  };

  const callee = {
    id: "src/b.ts::target:1",
    kind: "function" as const,
    name: "target",
    file: "src/b.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h-b",
  };

  store.addNode(caller);
  store.addNode(callee);
  store.setFileHash(caller.file, caller.content_hash);  // ← ADD: makes listFiles() return "src/a.ts"
  store.setFileHash(callee.file, callee.content_hash);  // ← ADD: makes listFiles() return "src/b.ts"

  return { store, caller, callee };
}
```

**No other tests need changes.** With `setFileHash` added:

- *"resolves unresolved calls edge"* test: `confirmed` loop runs over "src/a.ts" and "src/b.ts", finds the `__unresolved__::target:0` edge but it is excluded by `!isUnresolvedTarget(e.target)` → `confirmed = []` still. `work = [unresolved edge]`. Test still passes. ✅
- *"AC20 upgrades confirmed tree-sitter edge"* test: `confirmed` loop finds the tree-sitter calls edge from `caller` → `callee`, adds it to `work`. `client.definition()` confirms the target, lsp edge created, tree-sitter edge deleted. Test passes. ✅
- *"partial results"* test: both unresolved edges go into `work` via `getUnresolvedEdges()`. `confirmed` loop finds no non-unresolved tree-sitter edges (both edges are unresolved at collection time). Test still passes. ✅

**No change needed to Step 3 (implementation).** The `runLspIndexStage` implementation is correct; only the test helper was wrong.

---

### Optional improvement — add AC21 idempotency test to Step 1

The spec states: "Running the LSP indexer stage twice on the same graph produces no duplicate edges (idempotent)" (AC21). This AC has no test. Add the following test after the AC20 test in `test/indexer-lsp.test.ts`:

```typescript
test("AC21: running the LSP stage twice produces no duplicate edges (idempotent)", async () => {
  const { store, caller, callee } = mkStore();

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::target:0",
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: "target:2:5",
      content_hash: "h-a",
    },
    created_at: 1000,
  });

  const client: ITsServerClient = {
    async definition() {
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);
  await runLspIndexStage(store, "/project", client); // second run — must be a no-op

  expect(store.getUnresolvedEdges()).toHaveLength(0);
  const out = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(out).toHaveLength(1); // exactly 1, not 2
  expect(out[0]!.target).toBe(callee.id);

  store.close();
});
```

This is the only AC not covered by any test in the plan. The fix is additive and does not require changing the implementation.
