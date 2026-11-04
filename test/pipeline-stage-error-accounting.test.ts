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
      expect(store.getFailedLookups()).toEqual([{ kind: "index", source: "lsp stage", evidence: "write" }]);

      // The call a failed write left alone resolves on the next run, which clears the record.
      await indexProject(dir, store, { lspClientFactory: () => fakeClient });
      const beta = store.findNodes("beta", "src/hello.ts")[0]!;
      expect(store.getEdgesBySource(beta.id).filter((e) => e.kind === "calls").map((e) => e.provenance.source)).toEqual(["lsp"]);
      expect(store.getFailedLookups()).toEqual([]);

      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
