import { test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
import { isRemoved } from "./phase5-decision-matrix.js";

function registerTools() {
  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const tools: Array<{ name: string; execute: Function }> = [];
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        tools.push(tool);
      },
      on() {},
    };
  resetStoreForTesting();
    piCodegraph(mockPi as any);
    return tools;
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
}

function createFreshProject(): string {
  const projectRoot = join(tmpdir(), `pi-cg-trust-gating-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );
  return projectRoot;
}

function populateStore(projectRoot: string, content: string): string {
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "graph.db");
  const store = new SqliteGraphStore(dbPath);
  store.markCoverageIndexed();
  const extracted = extractFile("src/app.ts", content);
  store.addNode(extracted.module);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);
  store.setFileHash("src/app.ts", sha256Hex(content));
  store.close();
  return dbPath;
}

test("fresh symbol_graph tool calls omit the Trust header but keep provenance and signal lines", async () => {
  const projectRoot = createFreshProject();
  const tools = registerTools();
  const symbolGraphTool = tools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraphTool) throw new Error("symbol_graph tool was not registered");

  try {
    const result = await symbolGraphTool.execute(
      "call-1",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;

    if (!text.startsWith("Trust: fresh\n## foo (function)")) {
      throw new Error(`fresh read-only output lost the Trust header/body: ${text}`);
    }
    if (!/src\/app\.ts  2:[0-9a-f]{3}/.test(text)) {
      throw new Error("fresh read-only output lost the anchored body line");
    }
    if (!text.includes("leaf") || !text.includes("untested")) {
      throw new Error("fresh read-only output lost signal tags");
    }
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("non-fresh trace tool calls still render the Trust header", async () => {
  const projectRoot = createFreshProject();
  const tools = registerTools();
  const traceTool = tools.find((tool) => tool.name === "trace");
  if (!traceTool) throw new Error("trace tool was not registered");

  try {
    const result = await traceTool.execute(
      "call-2",
      { entry: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;

    if (!text.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")) {
      throw new Error(`non-fresh trace output lost the Trust header: ${text}`);
    }
    if (!text.includes("mode: static (heuristic, no runtime evidence)")) {
      throw new Error("non-fresh trace output lost the trace body");
    }
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

if (!isRemoved("graph_query")) {
test("readonly reindex output still renders the indexing-failed note", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-trust-readonly-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const original = "export function foo() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);
  const dbPath = populateStore(projectRoot, original);
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function foo() { return 2; }\n");
  chmodSync(dbPath, 0o444);

  const tools = registerTools();
  const graphQueryTool = tools.find((tool) => tool.name === "graph_query");
  if (!graphQueryTool) throw new Error("graph_query tool was not registered");

  try {
    const result = await graphQueryTool.execute(
      "call-3",
      { query: 'MATCH (n {name: "foo"}) RETURN n' },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;

    if (!text.includes("indexing-failed: graph may be stale (readonly database)")) {
      throw new Error("readonly reindex output lost the indexing-failed note");
    }
    if (!text.includes("foo")) {
      throw new Error("readonly reindex output lost graph_query results");
    }
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readonly reindex output still renders the indexing-failed note when the db directory blocks journal writes", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-trust-readonly-dir-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const original = "export function foo() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);
  const dbDir = join(projectRoot, ".codegraph");
  const dbPath = populateStore(projectRoot, original);
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function foo() { return 2; }\n");
  chmodSync(dbPath, 0o666);
  chmodSync(dbDir, 0o555);

  const tools = registerTools();
  const graphQueryTool = tools.find((tool) => tool.name === "graph_query");
  if (!graphQueryTool) throw new Error("graph_query tool was not registered");

  try {
    const result = await graphQueryTool.execute(
      "call-4",
      { query: 'MATCH (n {name: "foo"}) RETURN n' },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;

    if (!text.includes("indexing-failed: graph may be stale (readonly database)")) {
      throw new Error("readonly-directory reindex output lost the indexing-failed note");
    }
    if (!text.includes("foo")) {
      throw new Error("readonly-directory reindex output lost graph_query results");
    }
  } finally {
    chmodSync(dbDir, 0o755);
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
}
