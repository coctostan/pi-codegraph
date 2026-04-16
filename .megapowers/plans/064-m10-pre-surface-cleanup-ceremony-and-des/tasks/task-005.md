---
id: 5
title: Normalize the `graph_query` description
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-graph-query-description.test.ts
files_to_create: []
---

### Task 5: Normalize the `graph_query` description [depends: 4]

**Files:**
- Modify: `src/index.ts`
- Test: `test/extension-graph-query-description.test.ts`

**Step 1 — Write the failing test**
Replace `test/extension-graph-query-description.test.ts` with this exact content:

```ts
import { test } from "bun:test";

test("pi extension registers graph_query with the approved description", async () => {
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
  if (!tool) {
    throw new Error("graph_query tool was not registered");
  }

  const expected = "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query.";
  if (tool.description !== expected) {
    throw new Error(`graph_query description mismatch: ${tool.description}`);
  }
  if (tool.description.includes('MATCH (a {name: "hello"}) RETURN a')) {
    throw new Error("graph_query description still includes inline examples");
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-graph-query-description.test.ts`
Expected: FAIL — `Error: graph_query description mismatch: Execute a Cypher subset query against the graph.`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the `graph_query` description block with this exact string:

```ts
description:
  "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query.",
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-graph-query-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing
