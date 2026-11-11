import { expect, test, describe } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { GraphEdge } from "../src/graph/types.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

describe("RC-A accounting: stage write failures bump result.errors", () => {
  test("LSP stage write failure increments errors, does not abort pipeline", async () => {
    const dir = join(tmpdir(), `pi-cg-pipeline-errors-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
    );
    try {
      const store = new SqliteGraphStore(join(dir, "graph.db"));
      const fakeClient: ITsServerClient = {
        async definition(_f, _line, _col) {
          return { file: "src/hello.ts", line: 1, col: 1 };
        },
        async references() { return []; },
        async implementations() { return []; },
        async shutdown() {},
      };

      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let lspWrites = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.provenance.source === "lsp") {
          lspWrites++;
          throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      let result;
      try {
        result = await indexProject(dir, store, { lspClientFactory: () => fakeClient });
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      // All planned LSP writes were attempted (stage did not abort on first throw).
      expect(lspWrites).toBeGreaterThanOrEqual(1);
      // Pipeline completed and returned a result.
      expect(result).toBeDefined();
      // Every failed guarded write bumps errors.
      expect(result.errors).toBeGreaterThanOrEqual(lspWrites);
      expect(store.getFailures()).toEqual([{ kind: "index", source: "lsp stage", evidence: "write" }]);

      // The call a failed write left alone resolves on the next run, which clears the record.
      await indexProject(dir, store, { lspClientFactory: () => fakeClient });
      const beta = store.findNodes("beta", "src/hello.ts")[0]!;
      expect(store.getEdgesBySource(beta.id).filter((e) => e.kind === "calls").map((e) => e.provenance.source)).toEqual(["lsp"]);
      expect(store.getFailures()).toEqual([]);

      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a file the run couldn't extract or remove is recorded, and retried by the next run", async () => {
    const dir = join(tmpdir(), `pi-cg-pipeline-lost-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/a.ts"), "export function a() {}\n");
    writeFileSync(join(dir, "src/b.ts"), "export function b() {}\n");
    const client: ITsServerClient = {
      async definition() { return null; },
      async references() { return []; },
      async implementations() { return []; },
      async shutdown() {},
    };
    const store = new SqliteGraphStore(join(dir, "graph.db"));
    const { addNode, deleteFile } = SqliteGraphStore.prototype;
    try {
      await indexProject(dir, store, { lspClientFactory: () => client });
      writeFileSync(join(dir, "src/a.ts"), "export function a2() {}\n");
      rmSync(join(dir, "src/b.ts"));
      SqliteGraphStore.prototype.addNode = function (node) {
        if (node.file === "src/a.ts") throw new Error("SQLITE_FULL: database or disk is full");
        return addNode.call(this, node);
      };
      SqliteGraphStore.prototype.deleteFile = () => { throw new Error("SQLITE_FULL: database or disk is full"); };
      await indexProject(dir, store, { lspClientFactory: () => client });
      Object.assign(SqliteGraphStore.prototype, { addNode, deleteFile });
      expect(store.getFailures()).toEqual([
        { kind: "index", source: "src/a.ts", evidence: "extract" },
        { kind: "index", source: "src/b.ts", evidence: "remove" },
      ]);

      await indexProject(dir, store, { lspClientFactory: () => client });
      expect(store.getFailures()).toEqual([]);
      expect(store.findNodes("a2", "src/a.ts")).toHaveLength(1);
      expect(store.listFiles()).toEqual(["src/a.ts"]);
    } finally {
      Object.assign(SqliteGraphStore.prototype, { addNode, deleteFile });
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
