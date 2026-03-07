import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphStore } from "../src/graph/store.js";
import { applyRuleMatches, type AstGrepRule, type SgMatch } from "../src/indexer/ast-grep.js";

test("GraphStore contract used by Stage 3 exists", () => {
  const store: GraphStore = new SqliteGraphStore();
  try {
    expect(typeof store.findNodes).toBe("function");
    expect(typeof store.getNeighbors).toBe("function");
    expect(typeof store.getNodesByFile).toBe("function");
    expect(typeof store.addNode).toBe("function");
    expect(typeof store.addEdge).toBe("function");
    expect(typeof store.deleteFile).toBe("function");
  } finally {
    store.close();
  }
});

test("applyRuleMatches creates endpoint nodes and routes_to edges", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/api.ts::handlerA:3", kind: "function", name: "handlerA", file: "src/api.ts", start_line: 3, end_line: 6, content_hash: "hash-api" });
    store.addNode({ id: "src/api.ts::handlerB:7", kind: "function", name: "handlerB", file: "src/api.ts", start_line: 7, end_line: 10, content_hash: "hash-api" });
    const rule: AstGrepRule = {
      name: "express-route",
      pattern: "$APP.$METHOD($PATH, $$$HANDLERS)",
      lang: "typescript",
      produces: { edge_kind: "routes_to", from_capture: "HANDLERS", to_template: "endpoint:{METHOD}:{PATH}", confidence: 0.9 },
    };
    const matches: SgMatch[] = [
      { file: "src/api.ts", line: 2, column: 1, metaVariables: { METHOD: "Get", PATH: "'/users'", HANDLERS: ["handlerA", "handlerB"] } },
      { file: "src/api.ts", line: 12, column: 1, metaVariables: { METHOD: "GET", PATH: "'/admins'", HANDLERS: ["handlerA"] } },
    ];

    applyRuleMatches(store, rule, matches);
    const endpoint = store.getNode("endpoint:GET:/users")!;
    expect(endpoint.kind).toBe("endpoint"); // AC 12
    expect(endpoint.id).toMatch(/^endpoint:[A-Z]+:\/users$/); // explicit AC 28 uppercase METHOD format
    const aRoutes = store.getNeighbors("src/api.ts::handlerA:3", { direction: "out", kind: "routes_to" });
    const bRoutes = store.getNeighbors("src/api.ts::handlerB:7", { direction: "out", kind: "routes_to" });
    expect(aRoutes.map((r) => r.node.id).sort()).toEqual(["endpoint:GET:/admins", "endpoint:GET:/users"]);
    expect(bRoutes.map((r) => r.node.id)).toEqual(["endpoint:GET:/users"]); // AC 13
    expect(store.getNode("endpoint:GET:'/users'")).toBeNull(); // PATH quote stripping verified
  } finally {
    store.close();
  }
});

test("template rendering supports additional capture keys (e.g. {HANDLER})", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/api.ts::handlerA:3", kind: "function", name: "handlerA", file: "src/api.ts", start_line: 3, end_line: 6, content_hash: "hash-api" });
    const rule: AstGrepRule = {
      name: "express-route-custom-template",
      pattern: "$APP.$METHOD($PATH, $$$HANDLERS)",
      lang: "typescript",
      produces: { edge_kind: "routes_to", from_capture: "HANDLERS", to_template: "endpoint:{METHOD}:{PATH}:{HANDLERS}", confidence: 0.9 },
    };
    const matches: SgMatch[] = [
      { file: "src/api.ts", line: 2, column: 1, metaVariables: { METHOD: "get", PATH: "'/users'", HANDLERS: ["handlerA"] } },
    ];
    applyRuleMatches(store, rule, matches);
    expect(store.getNode("endpoint:GET:/users:handlerA")).toBeDefined();
  } finally {
    store.close();
  }
});
