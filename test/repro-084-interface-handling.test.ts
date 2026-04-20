import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { resolveImplementations } from "../src/indexer/lsp-resolver.js";
import { extractFile } from "../src/indexer/tree-sitter.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function addIndexedFile(store: SqliteGraphStore, file: string, content: string): void {
  const extracted = extractFile(file, content);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);
  store.setFileHash(file, extracted.module.content_hash);
}

test("repro #076: symbolGraph contract output for interfaces should list interface members", () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-076-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const storeFile = [
    "export interface GraphStatistics {",
    "  nodes: Record<string, number>;",
    "  edges: Record<string, Record<string, number>>;",
    "  files: { total: number; stale: number };",
    "}",
    "",
    "export interface GraphStore {",
    "  addNode(node: GraphNode): void;",
    "  getNode(id: string): GraphNode | null;",
    "}",
    "",
  ].join("\n");
  writeFileSync(join(projectRoot, "src", "store.ts"), storeFile);

  const store = new SqliteGraphStore();
  try {
    addIndexedFile(store, "src/store.ts", storeFile);
    const graphStoreOutput = symbolGraph({
      name: "GraphStore",
      file: "src/store.ts",
      include: ["contract"],
      store,
      projectRoot,
    });

    expect(graphStoreOutput).toContain("## Contract: GraphStore");
    expect(graphStoreOutput).toContain("### Methods");
    expect(graphStoreOutput).toContain("addNode(node: GraphNode): void");
    expect(graphStoreOutput).toContain("getNode(id: string): GraphNode | null");

    const graphStatisticsOutput = symbolGraph({
      name: "GraphStatistics",
      file: "src/store.ts",
      include: ["contract"],
      store,
      projectRoot,
    });

    expect(graphStatisticsOutput).toContain("## Contract: GraphStatistics");
    expect(graphStatisticsOutput).toContain("### Fields");
    expect(graphStatisticsOutput).toContain("nodes: Record<string, number>");
    expect(graphStatisticsOutput).toContain("files: { total: number; stale: number }");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("repro #077: resolveImplementations should not add an implements edge from a return-site match", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-077-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const storeFile = [
    "export interface GraphStatistics {",
    "  nodes: Record<string, number>;",
    "  edges: Record<string, Record<string, number>>;",
    "  files: { total: number; stale: number };",
    "}",
    "",
    "export interface GraphStore {",
    "  getStatistics(): GraphStatistics;",
    "}",
    "",
  ].join("\n");
  const sqliteFile = [
    'import type { GraphStatistics, GraphStore } from "./store.js";',
    "",
    "export class SqliteGraphStore implements GraphStore {",
    "  getStatistics(): GraphStatistics {",
    "    const nodes = {};",
    "    const edges = {};",
    "    const total = 0;",
    "    const stale = 0;",
    "    return { nodes, edges, files: { total, stale } };",
    "  }",
    "}",
    "",
  ].join("\n");

  writeFileSync(join(projectRoot, "src", "store.ts"), storeFile);
  writeFileSync(join(projectRoot, "src", "sqlite.ts"), sqliteFile);

  const store = new SqliteGraphStore();
  try {
    addIndexedFile(store, "src/store.ts", storeFile);
    addIndexedFile(store, "src/sqlite.ts", sqliteFile);

    const graphStatistics = store.findNodes("GraphStatistics", "src/store.ts")[0]!;
    const sqliteGraphStore = store.findNodes("SqliteGraphStore", "src/sqlite.ts")[0]!;

    const client: ITsServerClient = {
      async implementations() {
        return [{ file: "src/sqlite.ts", line: 9, col: 12 }];
      },
      async definition() {
        return null;
      },
      async references() {
        return [];
      },
      async shutdown() {},
    };

    await resolveImplementations(graphStatistics, store, projectRoot, client);

    const implementsEdges = store
      .getEdgesBySource(sqliteGraphStore.id)
      .filter((edge) => edge.kind === "implements" && edge.target === graphStatistics.id && edge.provenance.source === "lsp");

    expect(implementsEdges).toHaveLength(0);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
