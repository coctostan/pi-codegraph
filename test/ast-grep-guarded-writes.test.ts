import { expect, test, describe } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { applyRuleMatches, type AstGrepRule, type SgMatch } from "../src/indexer/ast-grep.js";
import type { GraphEdge } from "../src/graph/types.js";

function makeStore(): { store: SqliteGraphStore; dir: string } {
  const dir = join(tmpdir(), `pi-cg-astgrep-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const store = new SqliteGraphStore(join(dir, "graph.db"));
  return { store, dir };
}

describe("RC-A/ast-grep: applyRuleMatches writes are guarded", () => {
  test("routes_to: addNode throw does not abort the stage", () => {
    const { store, dir } = makeStore();
    try {
      store.addNode({
        id: "src/r.ts::handlerA", kind: "function", name: "handlerA",
        file: "src/r.ts", start_line: 10, end_line: 10, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/r.ts::handlerB", kind: "function", name: "handlerB",
        file: "src/r.ts", start_line: 20, end_line: 20, content_hash: "h", is_exported: true,
      });
      const rule: AstGrepRule = {
        name: "express-route",
        pattern: "...",
        lang: "typescript",
        produces: {
          edge_kind: "routes_to",
          from_capture: "HANDLER",
          to_template: "endpoint:{METHOD}:{PATH}",
          confidence: 0.8,
        },
      };
      const matches: SgMatch[] = [
        {
          file: "src/r.ts",
          line: 10,
          column: 1,
          metaVariables: { METHOD: "get", PATH: "/a", HANDLER: "handlerA" },
        },
        {
          file: "src/r.ts",
          line: 20,
          column: 1,
          metaVariables: { METHOD: "get", PATH: "/b", HANDLER: "handlerB" },
        },
      ];

      // Fault the endpoint `addNode` call, not `addEdge`. This forces the
      // implementation to wrap `store.addNode(endpointNode)` (src/indexer/ast-grep.ts:208)
      // in a try/catch as well — guarding only `store.addEdge(...)` would let the
      // first throw propagate out of `applyRoutesToMatches` and abort the stage.
      const originalAddNode = SqliteGraphStore.prototype.addNode;
      let endpointNodeWrites = 0;
      SqliteGraphStore.prototype.addNode = function (node) {
        if (node.kind === "endpoint") {
          endpointNodeWrites++;
          if (endpointNodeWrites === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddNode.call(this, node);
      };

      try {
        applyRuleMatches(store, rule, matches);
      } finally {
        SqliteGraphStore.prototype.addNode = originalAddNode;
      }

      // Both matches attempted an endpoint addNode — stage did not abort.
      expect(endpointNodeWrites).toBe(2);
      // The second match persisted a `routes_to` edge for handlerB.
      const edges = store.queryRows<{ source: string }>(
        "SELECT source FROM edges WHERE kind = 'routes_to' AND provenance_source = 'ast-grep'",
      );
      expect(edges.length).toBe(1);
      expect(edges[0]!.source).toBe("src/r.ts::handlerB");
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("renders: addEdge throw does not abort the stage", () => {
    const { store, dir } = makeStore();
    try {
      store.addNode({
        id: "src/v.tsx::Page", kind: "function", name: "Page",
        file: "src/v.tsx", start_line: 1, end_line: 50, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/v.tsx::HeaderA", kind: "function", name: "HeaderA",
        file: "src/v.tsx", start_line: 60, end_line: 60, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/v.tsx::HeaderB", kind: "function", name: "HeaderB",
        file: "src/v.tsx", start_line: 70, end_line: 70, content_hash: "h", is_exported: true,
      });

      const rule: AstGrepRule = {
        name: "react-render",
        pattern: "...",
        lang: "typescript",
        produces: {
          edge_kind: "renders",
          from_context: "enclosing_function",
          to_capture: "COMPONENT",
          confidence: 0.7,
        },
      };
      const matches: SgMatch[] = [
        { file: "src/v.tsx", line: 10, column: 1, metaVariables: { COMPONENT: "HeaderA" } },
        { file: "src/v.tsx", line: 20, column: 1, metaVariables: { COMPONENT: "HeaderB" } },
      ];

      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let renderWrites = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.kind === "renders") {
          renderWrites++;
          if (renderWrites === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      try {
        applyRuleMatches(store, rule, matches);
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      expect(renderWrites).toBe(2);
      const edges = store.queryRows<{ source: string }>(
        "SELECT source FROM edges WHERE kind = 'renders' AND provenance_source = 'ast-grep'",
      );
      expect(edges.length).toBe(1);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
