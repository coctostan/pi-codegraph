---
id: 2
title: "RC-A/LSP: guard unresolved-branch write pair in runLspIndexStage"
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/lsp.ts
files_to_create:
  - test/lsp-stage-guarded-writes.test.ts
---

Wrap the `deleteEdge` + `addEdge` pair at `src/indexer/lsp.ts:79-80` (the
*unresolved-target* branch) in a try/catch that continues the loop on
failure. This is the exact unguarded write-pair the reproduction uses to
trigger the bug.

**Files:**
- Modify: `src/indexer/lsp.ts`
- Create: `test/lsp-stage-guarded-writes.test.ts`

**Step 1 — Write the failing test**

Current `runLspIndexStage` signature (from `read`):
```ts
export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<void>
```

Create `test/lsp-stage-guarded-writes.test.ts`:

```ts
import { expect, test, describe } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runLspIndexStage } from "../src/indexer/lsp.js";
import type { GraphEdge } from "../src/graph/types.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

function makeStore(): { store: SqliteGraphStore; dir: string } {
  const dir = join(tmpdir(), `pi-cg-lsp-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const store = new SqliteGraphStore(join(dir, "graph.db"));
  return { store, dir };
}

describe("RC-A/LSP: unresolved-branch writes are guarded", () => {
  test("one addEdge throw does not abort the stage; remaining edges still written", async () => {
    const { store, dir } = makeStore();
    try {
      // Two source functions in the same file, each with one unresolved call.
      store.addNode({
        id: "src/x.ts::__module__", kind: "module", name: "src/x.ts",
        file: "src/x.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false,
      });
      store.addNode({
        id: "src/x.ts::callerA", kind: "function", name: "callerA",
        file: "src/x.ts", start_line: 2, end_line: 2, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/x.ts::callerB", kind: "function", name: "callerB",
        file: "src/x.ts", start_line: 5, end_line: 5, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/x.ts::targetA", kind: "function", name: "targetA",
        file: "src/x.ts", start_line: 10, end_line: 10, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/x.ts::targetB", kind: "function", name: "targetB",
        file: "src/x.ts", start_line: 20, end_line: 20, content_hash: "h", is_exported: true,
      });
      const unresolvedA: GraphEdge = {
        source: "src/x.ts::callerA",
        target: "__unresolved__::targetA",
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetA:2:1", content_hash: "h" },
        created_at: 1,
      };
      const unresolvedB: GraphEdge = {
        source: "src/x.ts::callerB",
        target: "__unresolved__::targetB",
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetB:5:1", content_hash: "h" },
        created_at: 2,
      };
      store.addEdge(unresolvedA);
      store.addEdge(unresolvedB);

      // Fake client resolves both calls to their respective target lines.
      const client: ITsServerClient = {
        async definition(_f, line, _c) {
          if (line === 2) return { file: "src/x.ts", line: 10, col: 1 };
          if (line === 5) return { file: "src/x.ts", line: 20, col: 1 };
          return null;
        },
        async references() { return []; },
        async implementations() { return []; },
        async shutdown() {},
      };

      // Monkey-patch addEdge to throw the first time an LSP-provenance edge is written,
      // and succeed for the second.
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
        // The stage must not throw.
        await runLspIndexStage(store, dir, client);
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      // Both LSP writes were attempted.
      expect(lspCalls).toBe(2);

      // The second edge (callerB -> targetB) must now be a resolved LSP edge.
      const edgesFromB = store.getEdgesBySource("src/x.ts::callerB");
      const resolvedB = edgesFromB.find(
        (e) => e.kind === "calls" && e.provenance.source === "lsp" && e.target === "src/x.ts::targetB",
      );
      expect(resolvedB).toBeDefined();
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/lsp-stage-guarded-writes.test.ts`

Expected: FAIL — Bun prints the thrown error propagating out of the stage:
```
error: SQLITE_BUSY: database is locked
    at ... src/indexer/lsp.ts:80 ...
```
The assertions below are never reached because `runLspIndexStage` throws.

**Step 3 — Write minimal implementation**

Current unresolved branch (`src/indexer/lsp.ts:74-82`):

```ts
    if (isUnresolvedTarget(edge.target)) {
      const targetNode = store
        .getNodesByFile(loc.file)
        .find((n) => n.name === parsed.name && n.start_line === loc.line);
      if (!targetNode) continue;
      store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
      store.addEdge(makeLspEdge(edge.source, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
      continue;
    }
```

Replace with a guarded write pair (leave the confirmed-edge branch at lines
84-91 alone — that's Task 3):

```ts
    if (isUnresolvedTarget(edge.target)) {
      const targetNode = store
        .getNodesByFile(loc.file)
        .find((n) => n.name === parsed.name && n.start_line === loc.line);
      if (!targetNode) continue;
      try {
        store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
        store.addEdge(makeLspEdge(edge.source, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
      } catch {
        // transient write failure — skip this edge, continue stage
      }
      continue;
    }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/lsp-stage-guarded-writes.test.ts`

Expected: PASS — `lspCalls === 2`, `resolvedB` edge is present in the store.

**Step 5 — Verify no regressions**
Run: `bun test`

Expected: all passing. Task 1's `test/ensure-indexed-error-message.test.ts`
uses a `SqliteGraphStore.prototype.listFiles` throw path that is called from
`src/indexer/pipeline.ts:96` and `src/indexer/lsp.ts:46` — both *outside*
the per-item try/catch introduced here. That regression therefore stays red
on the baseline and remains green after Task 1 without any changes to Task
1's test file from this task.
