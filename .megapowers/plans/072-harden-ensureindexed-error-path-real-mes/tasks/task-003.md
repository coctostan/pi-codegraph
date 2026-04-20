---
id: 3
title: "RC-A/LSP: guard confirmed-branch write pair in runLspIndexStage"
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/indexer/lsp.ts
  - test/lsp-stage-guarded-writes.test.ts
files_to_create: []
---

Wrap the `deleteEdge` + `addEdge` pair at `src/indexer/lsp.ts:90-91` (the
*confirmed-edge* branch) in the same try/catch pattern applied to the
unresolved branch in Task 2.

**Files:**
- Modify: `src/indexer/lsp.ts`
- Test: `test/lsp-stage-guarded-writes.test.ts` (extend from Task 2)

**Step 1 — Write the failing test**

Append a second test to `test/lsp-stage-guarded-writes.test.ts` (created in
Task 2). Place the new test inside the existing `describe(...)` block:

```ts
  test("confirmed-branch: one addEdge throw does not abort the stage", async () => {
    const { store, dir } = makeStore();
    try {
      // Pre-existing LSP-confirmed edge (so loop enters the confirmed-edge branch).
      store.addNode({
        id: "src/y.ts::__module__", kind: "module", name: "src/y.ts",
        file: "src/y.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false,
      });
      store.addNode({
        id: "src/y.ts::callerA", kind: "function", name: "callerA",
        file: "src/y.ts", start_line: 2, end_line: 2, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/y.ts::callerB", kind: "function", name: "callerB",
        file: "src/y.ts", start_line: 5, end_line: 5, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/y.ts::targetA", kind: "function", name: "targetA",
        file: "src/y.ts", start_line: 10, end_line: 10, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/y.ts::targetB", kind: "function", name: "targetB",
        file: "src/y.ts", start_line: 20, end_line: 20, content_hash: "h", is_exported: true,
      });
      // tree-sitter edges with resolved targets (not __unresolved__) — these enter the confirmed branch.
      const resolvedA: GraphEdge = {
        source: "src/y.ts::callerA",
        target: "src/y.ts::targetA",
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetA:2:1", content_hash: "h" },
        created_at: 1,
      };
      const resolvedB: GraphEdge = {
        source: "src/y.ts::callerB",
        target: "src/y.ts::targetB",
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetB:5:1", content_hash: "h" },
        created_at: 2,
      };
      store.addEdge(resolvedA);
      store.addEdge(resolvedB);
      // `runLspIndexStage` builds its confirmed-branch work list by iterating
      // `store.listFiles()` (src/indexer/lsp.ts:45-54). Without a file-hash row
      // for src/y.ts, `listFiles()` returns [] and the confirmed branch never
      // runs — the test would fail at `expect(lspCalls).toBe(2)` with
      // `Received: 0` instead of exercising the actual bug. Seed the file hash
      // so the confirmed branch is reached.
      store.setFileHash("src/y.ts", "h");
      const client: ITsServerClient = {
        async definition(_f, line, _c) {
          if (line === 2) return { file: "src/y.ts", line: 10, col: 1 };
          if (line === 5) return { file: "src/y.ts", line: 20, col: 1 };
          return null;
        },
        async references() { return []; },
        async implementations() { return []; },
        async shutdown() {},
      };

      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let lspCalls = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.provenance.source === "lsp") {
          lspCalls++;
          if (lspCalls === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      try {
        await runLspIndexStage(store, dir, client);
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      expect(lspCalls).toBe(2);
      const edgesB = store.getEdgesBySource("src/y.ts::callerB");
      const lspEdgeB = edgesB.find(
        (e) => e.kind === "calls" && e.provenance.source === "lsp" && e.target === "src/y.ts::targetB",
      );
      expect(lspEdgeB).toBeDefined();
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/lsp-stage-guarded-writes.test.ts`

Expected: FAIL on the new test — Bun prints:
```
error: SQLITE_BUSY: database is locked
    at ... src/indexer/lsp.ts:91 ...
```
The first test (Task 2) still passes.

**Step 3 — Write minimal implementation**

Current confirmed branch (`src/indexer/lsp.ts:84-91`):

```ts
    const existingTarget = store.getNode(edge.target);
    if (!existingTarget) continue;

    const sameTarget = existingTarget.file === loc.file && existingTarget.start_line === loc.line;
    if (!sameTarget) continue;

    store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
    store.addEdge(makeLspEdge(edge.source, edge.target, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
  }
```

Change the last two lines to a guarded pair:

```ts
    try {
      store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
      store.addEdge(makeLspEdge(edge.source, edge.target, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
    } catch {
      // transient write failure — skip this edge, continue stage
    }
  }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/lsp-stage-guarded-writes.test.ts`

Expected: PASS — both tests pass; `lspCalls === 2` and `lspEdgeB` is present.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.
