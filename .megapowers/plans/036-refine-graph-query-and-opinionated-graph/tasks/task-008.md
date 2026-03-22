---
id: 8
title: Document working graph_query examples in the extension description
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-graph-query-description.test.ts
---

### Task 8: Document working graph_query examples in the extension description

**Files:**
- Create: `test/extension-graph-query-description.test.ts`
- Modify: `src/index.ts`
- Test: `test/extension-graph-query-description.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-graph-query-description.test.ts` with:
```ts
import { expect, test } from "bun:test";

test("pi extension documents working graph_query examples in the tool description", async () => {
  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  mod.default(mockPi as any);

  const tool = registeredTools.find((candidate) => candidate.name === "graph_query");
  expect(tool).toBeDefined();
  expect(tool!.description).toContain('MATCH (a {name: "hello"}) RETURN a');
  expect(tool!.description).toContain('MATCH (a {name: "foo"})-[r:calls]->(b) RETURN a, r, b LIMIT 5');
  expect(tool!.description).toContain('MATCH (n) WHERE n.name = "GraphStore" RETURN n.name');
  expect(tool!.description).toContain('MATCH (n) WHERE n.name CONTAINS "Graph" RETURN n.name');
  expect(tool!.description).toContain('MATCH (n {kind: "function"}) RETURN n LIMIT 10');
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-graph-query-description.test.ts`
Expected: FAIL — `expect(received).toContain("MATCH (a {name: \"hello\"}) RETURN a")`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the `graph_query` tool description with:
```ts
    description: [
      "Execute a Cypher subset query against the graph.",
      "Examples:",
      'MATCH (a {name: "hello"}) RETURN a',
      'MATCH (a {name: "foo"})-[r:calls]->(b) RETURN a, r, b LIMIT 5',
      'MATCH (n) WHERE n.name = "GraphStore" RETURN n.name',
      'MATCH (n) WHERE n.name CONTAINS "Graph" RETURN n.name',
      'MATCH (n {kind: "function"}) RETURN n LIMIT 10',
    ].join("\n"),
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-graph-query-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
