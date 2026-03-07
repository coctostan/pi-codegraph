---
id: 6
title: Create endpoint nodes and routes_to edges from Express matches
status: approved
depends_on:
  - 4
  - 5
no_test: false
files_to_modify:
  - src/indexer/ast-grep.ts
files_to_create:
  - src/rules/express.yaml
  - test/indexer-ast-grep-express.test.ts
---

### Task 6: Create endpoint nodes and routes_to edges from Express matches [depends: 4, 5]
**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Create: `src/rules/express.yaml`
- Test: `test/indexer-ast-grep-express.test.ts`
**Step 1 — Write the failing test**
```ts
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
    expect(store.getNode("endpoint:GET:'/users'" )).toBeNull(); // PATH quote stripping verified
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
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-express.test.ts
```
Expected: `FAIL — Export named "applyRuleMatches" not found`

**Step 3 — Implement endpoint + routes_to processing**
```ts
// src/indexer/ast-grep.ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
function metaValue(meta: Record<string, string | string[]>, key: string): string | null {
  const value = meta[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  return null;
}
function metaValues(meta: Record<string, string | string[]>, key: string): string[] {
  const value = meta[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map(String);
  return [];
}
function renderTemplate(template: string, meta: Record<string, string | string[]>): string {
  return template.replace(/\{([A-Z_]+)\}/g, (_, key: string) => {
    const value = meta[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    return "";
  });
}
function applyRoutesToMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  for (const match of matches) {
    const rawMethod = metaValue(match.metaVariables, "METHOD");
    const rawPath = metaValue(match.metaVariables, "PATH");
    if (!rawMethod || !rawPath) continue;
    const method = rawMethod.toUpperCase();
    const path = rawPath.replace(/^['"]|['"]$/g, "");
    const endpointId = renderTemplate(rule.produces.to_template!, { ...match.metaVariables, METHOD: method, PATH: path });

    for (const handlerName of metaValues(match.metaVariables, rule.produces.from_capture ?? "")) {
      const handlerNode = store.findNodes(handlerName, match.file)[0];
      if (!handlerNode) continue;
      const endpointNode: GraphNode = {
        id: endpointId,
        kind: "endpoint",
        name: endpointId,
        file: match.file,
        start_line: match.line,
        end_line: match.line,
        content_hash: handlerNode.content_hash,
      };
      store.addNode(endpointNode);
      store.addEdge({
        source: handlerNode.id,
        target: endpointId,
        kind: "routes_to",
        provenance: { source: "ast-grep", confidence: rule.produces.confidence, evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`, content_hash: handlerNode.content_hash },
        created_at: Date.now(),
      });
    }
  }
}
export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  if (rule.produces.edge_kind === "routes_to") applyRoutesToMatches(store, rule, matches);
}
```
```yaml
# src/rules/express.yaml
- name: express-route
  pattern: $APP.$METHOD($PATH, $$$HANDLERS)
  lang: typescript
  produces:
    edge_kind: routes_to
    from_capture: HANDLERS
    to_template: endpoint:{METHOD}:{PATH}
    confidence: 0.9
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-express.test.ts
```
Expected: PASS
**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.
