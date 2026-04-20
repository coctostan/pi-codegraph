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
});
