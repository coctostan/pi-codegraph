import { expect, test, describe, afterEach } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { TsServerClient } from "../src/indexer/tsserver-client.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";
function mockLspClient(store: SqliteGraphStore): ITsServerClient {
  return {
    async definition(file: string, _line: number, _col: number) {
      const nodes = store.getNodesByFile(file);
      if (nodes.length > 0) {
        return { file, line: nodes[0]!.start_line, col: 1 };
      }
      return null;
    },
    async references(_file: string, _line: number, _col: number) {
      return [];
    },
    async implementations(_file: string, _line: number, _col: number) {
      return [];
    },
    async shutdown() {},
  };
}
function withCodegraphDevMode<T>(callback: () => T): T {
  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
}
describe("Bug #038: readonly database graceful degradation", () => {
  const testDirs: string[] = [];
  afterEach(() => {
    for (const dir of testDirs) {
      try {
        const dbPath = join(dir, ".codegraph", "graph.db");
        if (existsSync(dbPath)) chmodSync(dbPath, 0o644);
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
    testDirs.length = 0;
  });
  function createTestProject(): string {
    const projectRoot = join(tmpdir(), `pi-cg-readonly-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(
      join(projectRoot, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
    );
    testDirs.push(projectRoot);
    return projectRoot;
  }
  function populateStore(projectRoot: string): string {
    const dbDir = join(projectRoot, ".codegraph");
    mkdirSync(dbDir, { recursive: true });
    const dbPath = join(dbDir, "graph.db");
    const store = new SqliteGraphStore(dbPath);
    const content = "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n";
    const extracted = extractFile("src/hello.ts", content);
    store.addNode(extracted.module);
    for (const node of extracted.nodes) store.addNode(node);
    for (const edge of extracted.edges) store.addEdge(edge);
    store.setFileHash("src/hello.ts", sha256Hex(content));
    store.close();
    return dbPath;
  }
  function openReadonly(dbPath: string): SqliteGraphStore {
    chmodSync(dbPath, 0o444);
    return new SqliteGraphStore(dbPath);
  }
  test("writes to a readonly store produce the exact bug error message", () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);
    const store = openReadonly(dbPath);
    expect(() => store.setFileHash("new.ts", "abc")).toThrow("attempt to write a readonly database");
    expect(() =>
      store.addNode({
        id: "test::x",
        kind: "function",
        name: "x",
        file: "x.ts",
        start_line: 1,
        end_line: 1,
        content_hash: "z",
        is_exported: false,
      }),
    ).toThrow("attempt to write a readonly database");
    store.close();
    chmodSync(dbPath, 0o644);
  });
  test("reads from a readonly store work perfectly", () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);
    const store = openReadonly(dbPath);
    const nodes = store.findNodes("alpha");
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.name).toBe("alpha");
    const fileNodes = store.getNodesByFile("src/hello.ts");
    expect(fileNodes.length).toBeGreaterThan(0);
    const hash = store.getFileHash("src/hello.ts");
    expect(hash).not.toBeNull();
    store.close();
    chmodSync(dbPath, 0o644);
  });
  test("symbol_graph read logic works on readonly store", () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);
    const store = openReadonly(dbPath);
    const result = symbolGraph({ name: "alpha", store, projectRoot });
    expect(result).toContain("alpha");
    expect(result).toContain("function");
    store.close();
    chmodSync(dbPath, 0o644);
  });
  test("ensureIndexed catches readonly errors and allows subsequent reads", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    writeFileSync(
      join(projectRoot, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\nexport function delta() { return 99; }\n",
    );

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    withCodegraphDevMode(() => mod.default(mockPi as any));

    const originalDefinition = TsServerClient.prototype.definition;
    TsServerClient.prototype.definition = async () => ({ file: "src/hello.ts", line: 1, col: 1 });

    try {
      chmodSync(dbPath, 0o444);
      const ctx = { cwd: projectRoot };
      const sgResult = await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
      const sgText = sgResult.content[0]?.text ?? "";
      expect(sgText).toContain("alpha");
    } finally {
      TsServerClient.prototype.definition = originalDefinition;
      mod.resetStoreForTesting();
      chmodSync(dbPath, 0o644);
    }
  });
  test("symbol_graph lazy resolver (resolveMissingCallers) does not crash on readonly DB", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    {
      const tempStore = new SqliteGraphStore(dbPath);
      await indexProject(projectRoot, tempStore, {
        lspClientFactory: () => mockLspClient(tempStore),
      });
      tempStore.close();
    }

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    withCodegraphDevMode(() => mod.default(mockPi as any));
    const originalReferences = TsServerClient.prototype.references;
    TsServerClient.prototype.references = async () => [];
    try {
      chmodSync(dbPath, 0o444);
      const ctx = { cwd: projectRoot };
      const result = await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
      const text = result.content[0]?.text ?? "";
      expect(text).toContain("alpha");
      expect(text).toContain("function");
    } finally {
      TsServerClient.prototype.references = originalReferences;
      mod.resetStoreForTesting();
      chmodSync(dbPath, 0o644);
    }
  });
  test("tool output trust header indicates indexing-failed when DB is readonly", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    writeFileSync(
      join(projectRoot, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\nexport function delta() { return 99; }\n",
    );

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    withCodegraphDevMode(() => mod.default(mockPi as any));

    const originalDefinition = TsServerClient.prototype.definition;
    TsServerClient.prototype.definition = async () => ({ file: "src/hello.ts", line: 1, col: 1 });

    try {
      chmodSync(dbPath, 0o444);
      const ctx = { cwd: projectRoot };
      const sgResult = await sgExecute!("c1", { name: "alpha" }, undefined, undefined, ctx);
      expect(sgResult.content[0]?.text ?? "").toContain("indexing-failed");
    } finally {
      TsServerClient.prototype.definition = originalDefinition;
      mod.resetStoreForTesting();
      chmodSync(dbPath, 0o644);
    }
  });
});