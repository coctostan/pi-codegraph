import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runLspIndexStage } from "../src/indexer/lsp.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { extractFile } from "../src/indexer/tree-sitter.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";
import { calledName, type GraphEdge } from "../src/graph/types.js";

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

test("the LSP stage's upgraded edges keep their call_end, and an edge it leaves unresolved keeps its own", async () => {
  const { store, caller, callee } = mkStore();
  const call = (target: string, evidence: string, line: number): GraphEdge => ({
    source: caller.id,
    target,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence, content_hash: "h-a" },
    created_at: line,
    call_end: { line, col: 12 },
  });
  const other = { ...callee, id: "src/c.ts::other:1", name: "other", file: "src/c.ts" };
  store.addNode(other);
  store.addEdge(call("__unresolved__::target:0", "target:2:5", 2));
  store.addEdge(call(other.id, "other:3:5", 3));
  store.addEdge(call("__unresolved__::missing:0", "missing:4:5", 4));

  const client: ITsServerClient = {
    async definition(_file, line) {
      if (line === 2) return { file: "src/b.ts", line: 1, col: 17 };
      if (line === 3) return { file: "src/c.ts", line: 1, col: 17 };
      return null;
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  const rows = store.getEdgesBySource(caller.id).map((e) => [e.target, e.provenance.source, e.call_end]);
  expect(rows.sort()).toEqual([
    ["__unresolved__::missing:0", "tree-sitter", { line: 4, col: 12 }],
    [callee.id, "lsp", { line: 2, col: 12 }],
    [other.id, "lsp", { line: 3, col: 12 }],
  ].sort());

  store.close();
});

test("a call inside a test callback resolves to its target with the test node kept as the caller", async () => {
  const { store, callee } = mkStore();
  const extracted = extractFile("tests/b.test.ts", ['test("targets", () => {', "  target();", "});"].join("\n"));
  store.addNode(extracted.module);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);

  const client: ITsServerClient = {
    async definition(file, line, col) {
      expect([file, line, col]).toEqual(["tests/b.test.ts", 2, 3]);
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  expect(store.getUnresolvedEdges()).toHaveLength(0);
  const callers = store.getNeighbors(callee.id, { direction: "in", kind: "calls" });
  expect(callers.map((c) => [c.node.name, c.edge.provenance.source])).toEqual([["tests/b.test.ts > targets", "lsp"]]);

  store.close();
});

test("member calls resolve to members: obj.m(), an inherited this.m(), new X() to its constructor or class, a decorated field", async () => {
  const store = new SqliteGraphStore();
  const files: Record<string, string[]> = {
    "src/store.ts": [
      "export class Base {",
      "  m() {}",
      "  close() {}",
      "}",
      "export class Store extends Base {",
      "  constructor() { super(); }",
      "  @log",
      "  load = () => 1;",
      "  run() { this.m(); }",
      "}",
      "export class Plain {}",
    ],
    "src/use.ts": [
      'import { Store, Plain } from "./store";',
      "export function use(s: Store, xs: number[], other: Closer) {",
      "  s.load();",
      "  new Store();",
      "  new Plain();",
      "  xs.push(1);",
      "  other.close();",
      "  s.load();",
      "}",
    ],
  };
  for (const [file, lines] of Object.entries(files)) {
    const extracted = extractFile(file, lines.join("\n"));
    store.addNode(extracted.module);
    for (const node of extracted.nodes) store.addNode(node);
    for (const edge of extracted.edges) store.addEdge(edge);
    store.setFileHash(file, extracted.module.content_hash);
  }
  // tsserver's definition: a member's name, so a decorated field's is a line below its node's start; a constructor's
  // for `new X()`; a lib or interface member for a receiver no class types.
  const definitions: Record<string, { file: string; line: number; col: number }> = {
    "src/use.ts:3:5": { file: "src/store.ts", line: 8, col: 3 },
    "src/use.ts:8:5": { file: "src/store.ts", line: 8, col: 3 },
    "src/use.ts:4:7": { file: "src/store.ts", line: 6, col: 3 },
    "src/use.ts:5:7": { file: "src/store.ts", line: 11, col: 14 },
    "src/use.ts:7:9": { file: "lib.d.ts", line: 1, col: 1 },
    "src/store.ts:9:16": { file: "src/store.ts", line: 2, col: 3 },
  };
  const asked: string[] = [];
  const client: ITsServerClient = {
    async definition(file, line, col) {
      asked.push(`${file}:${line}:${col}`);
      return definitions[`${file}:${line}:${col}`] ?? null;
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  // xs.push() is asked about by no run: no class declares a `push`.
  expect(asked.sort()).toEqual(Object.keys(definitions).sort());
  const callees = (source: string) =>
    store.getNeighbors(source, { direction: "out", kind: "calls" }).map((n) => [n.node.name, n.edge.provenance.source, n.edge.call_end?.line]);
  expect(callees("src/use.ts::use:2").sort()).toEqual([
    ["Plain", "lsp", 5],
    ["Store.constructor", "lsp", 4],
    ["Store.load", "lsp", 3],
  ]);
  expect(callees("src/store.ts::Store.run:9")).toEqual([["Base.m", "lsp", 9]]);
  // The calls no project node answers stay hidden: no unresolved line, no edge a reader joins to a node.
  expect(store.getUnresolvedEdges().filter((e) => e.kind === "calls")).toEqual([]);
  expect(store.getEdgesBySource("src/use.ts::use:2").filter((e) => e.provenance.source === "tree-sitter").map((e) => e.provenance.evidence).sort()).toEqual(["close:7:9", "push:6:6"]);

  store.close();
});

test("a member call left hidden is no dangling edge, so an unchanged project's run re-extracts nothing", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-member-call-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export function a(xs: number[]) {\n  xs.push(1);\n}\n");
  const store = new SqliteGraphStore();
  const client = (): ITsServerClient => ({ definition: async () => null, references: async () => [], implementations: async () => [], shutdown: async () => {} });
  try {
    await indexProject(root, store, { lspClientFactory: client });
    expect(store.getEdgesBySource("src/a.ts::a:1").map((e) => e.provenance.evidence)).toEqual(["push:2:6"]);
    const cleared: string[] = [];
    const clearFile = store.clearFile.bind(store);
    store.clearFile = (file) => { cleared.push(file); clearFile(file); };
    await indexProject(root, store, { lspClientFactory: client });
    expect(cleared).toEqual([]);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a definition resolves to no module its name ends, and to the constructor of the class holding it, not a namesake's", async () => {
  const store = new SqliteGraphStore();
  const files: Record<string, string[]> = {
    "src/ts.ts": ["export default function () {}"],
    "src/inner.ts": [
      "export function a() { class Inner { constructor() {} } }",
      "export function b() { class Inner { constructor() {} } }",
    ],
    "src/use.ts": ['import ts from "./ts";', "export function use() {", "  ts();", "  new Inner();", "}"],
  };
  for (const [file, lines] of Object.entries(files)) {
    const extracted = extractFile(file, lines.join("\n"));
    store.addNode(extracted.module);
    for (const node of extracted.nodes) store.addNode(node);
    for (const edge of extracted.edges) store.addEdge(edge);
    store.setFileHash(file, extracted.module.content_hash);
  }
  const definitions: Record<string, { file: string; line: number; col: number }> = {
    "src/use.ts:3:3": { file: "src/ts.ts", line: 1, col: 16 },
    "src/use.ts:4:7": { file: "src/inner.ts", line: 2, col: 29 },
  };
  const client: ITsServerClient = {
    definition: async (file, line, col) => definitions[`${file}:${line}:${col}`] ?? null,
    references: async () => [],
    implementations: async () => [],
    shutdown: async () => {},
  };

  await runLspIndexStage(store, "/project", client);

  expect(store.getNeighbors("src/use.ts::use:2", { direction: "out", kind: "calls" }).map((n) => n.node.id)).toEqual(["src/inner.ts::Inner.constructor:2"]);
  expect(store.getUnresolvedEdges().filter((e) => e.kind === "calls").map((e) => e.target)).toEqual(["__unresolved__::ts:0"]);
  store.close();
});

test("a call names a member by its bare name, any other node by its whole name", () => {
  expect(calledName({ kind: "function", name: "Store.load" })).toBe("load");
  expect(calledName({ kind: "function", name: "load" })).toBe("load");
  expect(calledName({ kind: "module", name: "src/ts.ts" })).toBe("src/ts.ts");
  expect(calledName({ kind: "test", name: "a.test.ts > b.c" })).toBe("a.test.ts > b.c");
});

test("a call tree-sitter resolved stays as it is when tsserver's definition names another node", async () => {
  const { store, caller, callee } = mkStore();
  const other = { ...callee, id: "src/c.ts::target:1", file: "src/c.ts" };
  store.addNode(other);
  store.addEdge({
    source: caller.id,
    target: callee.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "target:2:5", content_hash: "h-a" },
    created_at: 1000,
  });
  const client: ITsServerClient = {
    definition: async () => ({ file: "src/c.ts", line: 1, col: 17 }),
    references: async () => [],
    implementations: async () => [],
    shutdown: async () => {},
  };
  await runLspIndexStage(store, "/project", client);
  expect(store.getEdgesBySource(caller.id).map((e) => [e.target, e.provenance.source])).toEqual([[callee.id, "tree-sitter"]]);
  store.close();
});
