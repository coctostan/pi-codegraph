import { expect, test, describe, afterEach } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { graphQuery } from "../src/tools/graph-query.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { TsServerClient } from "../src/indexer/tsserver-client.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

// Helper: mock tsserver client that returns definitions to trigger LSP writes
function mockLspClient(store: SqliteGraphStore): ITsServerClient {
  return {
    async definition(file: string, _line: number, _col: number) {
      // Return a plausible definition location that matches an existing node
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
        // Restore write permissions before cleanup
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
    // Two functions: beta calls alpha (generates a call edge)
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

  // ─── Evidence: writes fail with the exact error ───
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

  // ─── Evidence: reads work fine on readonly ───
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

  // ─── Evidence: tool read logic works on readonly store ───
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

  test("graph_query read logic works on readonly store", () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);
    const store = openReadonly(dbPath);

    const result = graphQuery({ query: 'MATCH (n {name: "alpha"}) RETURN n', store, projectRoot });
    expect(result).toContain("alpha");

    store.close();
    chmodSync(dbPath, 0o644);
  });

  // ─── FIX VERIFICATION: ensureIndexed catches errors ───
  test("ensureIndexed catches readonly errors and allows subsequent reads", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    // Modify a source file — forces re-indexing attempt
    writeFileSync(
      join(projectRoot, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\nexport function delta() { return 99; }\n",
    );

    // Simulate extension runtime: register tools, invoke with readonly store
    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    let gqExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
        if (tool.name === "graph_query") gqExecute = tool.execute;
      },
      on() {},
    };
    withCodegraphDevMode(() => mod.default(mockPi as any));

    const originalDefinition = TsServerClient.prototype.definition;
    TsServerClient.prototype.definition = async () => ({ file: "src/hello.ts", line: 1, col: 1 });

    try {
      // Make DB readonly and set up the store
      chmodSync(dbPath, 0o444);
      const ctx = { cwd: projectRoot };

      // symbol_graph should NOT throw — it should return stale data
      const sgResult = await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
      const sgText = sgResult.content[0]?.text ?? "";
      expect(sgText).toContain("alpha");

      // graph_query should NOT throw
      const gqResult = await gqExecute!("call-2", { query: 'MATCH (n {name: "alpha"}) RETURN n' }, undefined, undefined, ctx);
      const gqText = gqResult.content[0]?.text ?? "";
      expect(gqText).toContain("alpha");
    } finally {
      TsServerClient.prototype.definition = originalDefinition;
      mod.resetStoreForTesting();
      chmodSync(dbPath, 0o644);
    }
  });

  test("symbol_graph lazy resolver (resolveMissingCallers) does not crash on readonly DB", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    // Fully index first so there are nodes to resolve
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
      // Make readonly — ensureIndexed won't crash (Task 1), but
      // resolveMissingCallers/resolveImplementations will try addNode/addEdge
      chmodSync(dbPath, 0o444);
      const ctx = { cwd: projectRoot };

      // Should NOT throw — resolver writes should be caught
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

  test("resolve_edge returns clear error message on readonly DB instead of crashing", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    // Index first
    {
      const tempStore = new SqliteGraphStore(dbPath);
      await indexProject(projectRoot, tempStore, {
        lspClientFactory: () => mockLspClient(tempStore),
      });
      tempStore.close();
    }

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let reExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "resolve_edge") reExecute = tool.execute;
      },
      on() {},
    };
    withCodegraphDevMode(() => mod.default(mockPi as any));

    try {
      chmodSync(dbPath, 0o444);
      const ctx = { cwd: projectRoot };

      // Should NOT throw — should return a result with an error message
      const result = await reExecute!(
        "call-1",
        { source: "alpha", target: "beta", kind: "calls", evidence: "test" },
        undefined,
        undefined,
        ctx,
      );
      const text = result.content[0]?.text ?? "";
      // Should indicate that the write failed, not crash
      expect(text).toContain("readonly");
    } finally {
      mod.resetStoreForTesting();
      chmodSync(dbPath, 0o644);
    }
  });

  test("tool output trust header indicates indexing-failed when DB is readonly", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    // Modify source to trigger indexing attempt
    writeFileSync(
      join(projectRoot, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\nexport function delta() { return 99; }\n",
    );

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    let gqExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
        if (tool.name === "graph_query") gqExecute = tool.execute;
      },
      on() {},
    };
    withCodegraphDevMode(() => mod.default(mockPi as any));

    const originalDefinition = TsServerClient.prototype.definition;
    TsServerClient.prototype.definition = async () => ({ file: "src/hello.ts", line: 1, col: 1 });

    try {
      chmodSync(dbPath, 0o444);
      const ctx = { cwd: projectRoot };

      // Read tools should include indexing-failed in trust header/note
      const sgResult = await sgExecute!("c1", { name: "alpha" }, undefined, undefined, ctx);
      expect(sgResult.content[0]?.text ?? "").toContain("indexing-failed");

      const gqResult = await gqExecute!("c2", { query: 'MATCH (n {name: "alpha"}) RETURN n' }, undefined, undefined, ctx);
      expect(gqResult.content[0]?.text ?? "").toContain("indexing-failed");
    } finally {
      TsServerClient.prototype.definition = originalDefinition;
      mod.resetStoreForTesting();
      chmodSync(dbPath, 0o644);
    }
  });
});
