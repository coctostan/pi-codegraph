import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runLspIndexStage } from "../src/indexer/lsp.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

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
  store.setFileHash(caller.file, caller.content_hash);
  store.setFileHash(callee.file, callee.content_hash);
  return { store, caller, callee };
}

test("resolves unresolved calls edge by evidence name + resolved file/line", async () => {
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
    async definition(file, line, col) {
      expect(file).toBe("src/a.ts");
      expect(line).toBe(2);
      expect(col).toBe(5);
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  expect(store.getUnresolvedEdges()).toHaveLength(0);

  const out = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.target).toBe(callee.id);
  expect(out[0]!.provenance.confidence).toBe(0.9);

  store.close();
});

test("AC20: upgrades confirmed tree-sitter edge when definition matches existing target node", async () => {
  const { store, caller, callee } = mkStore();

  store.addEdge({
    source: caller.id,
    target: callee.id,
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
    async definition(file, line, col) {
      expect(file).toBe("src/a.ts");
      expect(line).toBe(2);
      expect(col).toBe(5);
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  const all = store.getEdgesBySource(caller.id);
  const lsp = all.filter((e) => e.target === callee.id && e.provenance.source === "lsp");
  const ts = all.filter((e) => e.target === callee.id && e.provenance.source === "tree-sitter");

  expect(lsp).toHaveLength(1);
  expect(lsp[0]!.provenance.confidence).toBe(0.9);
  expect(ts).toHaveLength(0);

  store.close();
});

test("partial results are preserved when tsserver crashes mid-stage", async () => {
  const { store, caller } = mkStore();

  const callee2 = {
    id: "src/c.ts::other:1",
    kind: "function" as const,
    name: "other",
    file: "src/c.ts",
    start_line: 1,
    end_line: 2,
    content_hash: "h-c",
  };
  store.addNode(callee2);

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::target:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "target:2:5", content_hash: "h-a" },
    created_at: 1000,
  });
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::other:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "other:3:5", content_hash: "h-a" },
    created_at: 2000,
  });

  let n = 0;
  const client: ITsServerClient = {
    async definition() {
      n++;
      if (n === 1) return { file: "src/b.ts", line: 1, col: 17 };
      throw new Error("TsServer process exited unexpectedly");
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  const out = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(store.getUnresolvedEdges()).toHaveLength(1);

  store.close();
});

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
