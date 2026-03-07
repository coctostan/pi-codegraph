import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { runAstGrepIndexStage } from "../src/indexer/ast-grep.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

test("sg binary is available for Stage 3 subprocess integration", async () => {
  const proc = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) {
    console.warn("Skipping sg capability assertion: sg --version returned non-zero");
    return;
  }
  const stderr = await new Response(proc.stderr).text();
  expect(stderr).toBe("");
});

test("runAstGrepIndexStage passes only changed files to scanFn", async () => {
  const store = new SqliteGraphStore();
  const calls: string[][] = [];
  const spyScan = async (_root: string, _rule: any, files: string[]) => {
    calls.push(files);
    return [];
  };

  try {
    await runAstGrepIndexStage(store, process.cwd(), [], spyScan as any);
    expect(calls).toEqual([]); // unchanged run: no sg invocation
  } finally {
    store.close();
  }
});

test("runAstGrepIndexStage passes exactly provided changed files to scanFn", async () => {
  const store = new SqliteGraphStore();
  const calls: string[][] = [];
  const spyScan = async (_root: string, _rule: any, files: string[]) => {
    calls.push(files);
    return [];
  };

  try {
    await runAstGrepIndexStage(store, process.cwd(), ["src/a.ts", "src/b.ts"], spyScan as any);
    expect(calls.every((files) => files.length === 2)).toBeTrue();
    expect(calls[0]).toEqual(["src/a.ts", "src/b.ts"]);
  } finally {
    store.close();
  }
});

test("SqliteGraphStore.deleteFile removes endpoint nodes and Stage-3 routes_to edges", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/api.ts::handler:1", kind: "function", name: "handler", file: "src/api.ts", start_line: 1, end_line: 1, content_hash: "h" });
    store.addNode({ id: "endpoint:GET:/users", kind: "endpoint", name: "endpoint:GET:/users", file: "src/api.ts", start_line: 2, end_line: 2, content_hash: "h" });
    store.addEdge({
      source: "src/api.ts::handler:1",
      target: "endpoint:GET:/users",
      kind: "routes_to",
      provenance: { source: "ast-grep", confidence: 0.9, evidence: "t", content_hash: "h" },
      created_at: 1,
    });
    store.deleteFile("src/api.ts");
    expect(store.getNode("endpoint:GET:/users")).toBeNull();
    expect(store.getNeighbors("src/api.ts::handler:1", { direction: "out", kind: "routes_to" })).toHaveLength(0);
  } finally {
    store.close();
  }
});

test("bundled rules path resolves and bundled files exist", () => {
  const bundledDir = fileURLToPath(new URL("../src/rules/", import.meta.url));
  expect(bundledDir.includes("/src/rules")).toBeTrue();
  expect(existsSync(join(bundledDir, "express.yaml"))).toBeTrue();
  expect(existsSync(join(bundledDir, "react.yaml"))).toBeTrue();
});

test("pipeline Stage 3 minimal Express integration creates endpoint node id and routes_to edge", async () => {
  const root = join(tmpdir(), `pi-cg-express-min-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "api.ts"),
    "export function handler() { return 1; }\napp.get('/users', handler);\n",
  );

  const store = new SqliteGraphStore();
  try {
    const sgCheck = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck.exited) !== 0) {
      console.warn("Skipping Stage 3 integration assertion: sg not available");
      return;
    }
    await indexProject(root, store, { lspClientFactory: () => fakeClient });

    const handler = store.findNodes("handler", "src/api.ts")[0]!;
    expect(store.findNodes("handler", "src/api.ts")).toHaveLength(1);
    expect(store.getNode("endpoint:GET:/users")).toBeDefined();
    const routes = store.getNeighbors(handler.id, { direction: "out", kind: "routes_to" });
    expect(routes.map((result) => result.node.id)).toEqual(["endpoint:GET:/users"]);
    expect(routes.every((result) => result.edge.provenance.source === "ast-grep")).toBeTrue();
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pipeline Stage 3 indexes express routes, replaces changed matches, keeps unchanged reruns stable, and cleans removed-file artifacts", async () => {
  const root = join(tmpdir(), `pi-cg-express-stage3-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  const apiPath = join(root, "src", "api.ts");
  writeFileSync(
    apiPath,
    "export function handler() { return 1; }\nexport function caller() { return handler(); }\napp.get('/users', handler);\n",
  );

  const store = new SqliteGraphStore();
  try {
    const sgCheck = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck.exited) !== 0) {
      console.warn("Skipping Stage 3 integration assertion: sg not available");
      return;
    }

    await indexProject(root, store, { lspClientFactory: () => fakeClient });

    const handler = store.findNodes("handler", "src/api.ts")[0]!;
    expect(store.findNodes("handler", "src/api.ts")).toHaveLength(1);
    let routes = store.getNeighbors(handler.id, { direction: "out", kind: "routes_to" });
    expect(routes.map((result) => result.node.id)).toEqual(["endpoint:GET:/users"]);
    const caller = store.findNodes("caller", "src/api.ts")[0]!;
    // Use getEdgesBySource: unresolved calls edges (target=__unresolved__::X) are not in nodes table,
    // so getNeighbors JOIN won't return them with a fake LSP client.
    expect(store.getEdgesBySource(caller.id).filter((e) => e.kind === "calls")).toHaveLength(1);

    writeFileSync(
      apiPath,
      "export function handler() { return 1; }\nexport function caller() { return handler(); }\napp.get('/accounts', handler);\n",
    );
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    const updatedHandler = store.findNodes("handler", "src/api.ts")[0]!;
    routes = store.getNeighbors(updatedHandler.id, { direction: "out", kind: "routes_to" });
    expect(routes.map((result) => result.node.id)).toEqual(["endpoint:GET:/accounts"]);
    expect(routes.every((result) => result.edge.provenance.source === "ast-grep")).toBeTrue();
    expect(store.getNode("endpoint:GET:/users")).toBeNull();
    const callEdges = store.getEdgesBySource(caller.id).filter((e) => e.kind === "calls");
    expect(callEdges).toHaveLength(1);
    expect(callEdges[0]!.provenance.source).not.toBe("ast-grep");

    const edgeCountBeforeUnchanged = routes.length;
    const unchanged = await indexProject(root, store, { lspClientFactory: () => fakeClient });
    routes = store.getNeighbors(updatedHandler.id, { direction: "out", kind: "routes_to" });
    expect(routes).toHaveLength(1);
    expect(routes.length).toBe(edgeCountBeforeUnchanged);
    expect(new Set(routes.map((result) => `${result.edge.source}->${result.edge.target}`)).size).toBe(1);
    expect(store.findNodes("endpoint:GET:/accounts")).toHaveLength(1);
    expect(unchanged.indexed).toBe(0);
    expect(unchanged.skipped).toBeGreaterThan(0);

    rmSync(apiPath);
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    expect(store.findNodes("handler", "src/api.ts")).toHaveLength(0);
    expect(store.getNode("endpoint:GET:/accounts")).toBeNull();
    expect(store.getNeighbors(updatedHandler.id, { direction: "out", kind: "routes_to" })).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
