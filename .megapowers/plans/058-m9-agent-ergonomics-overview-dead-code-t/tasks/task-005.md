---
id: 5
title: "graph_overview: register tool in pi extension"
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/tool-graph-overview-wiring.test.ts
---

### Task 5: graph_overview: register tool in pi extension [depends: 4]

**Files:**
- Modify: `src/index.ts`
- Create: `test/tool-graph-overview-wiring.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers graph_overview tool with no required parameters", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const tool = registeredTools.find((t) => t.name === "graph_overview");
  expect(tool).toBeDefined();

  const schema = tool!.parameters as any;
  // No required params
  expect(schema.required ?? []).toEqual([]);

  // Should have ptc with read-only policy
  expect((tool as any).ptc?.readOnly).toBe(true);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined() — Expected undefined to be defined`

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at top:
```typescript
import { graphOverview } from "./tools/graph-overview.js";
```

2. Add params schema after existing schemas:
```typescript
const GraphOverviewParams = Type.Object({});
```

3. Register the tool inside `piCodegraph()`, after the `symbol_contract` registration:
```typescript
  registerReadOnlyTool(pi, {
    name: "graph_overview",
    label: "Graph Overview",
    description: "Return a high-level overview of the indexed codebase: symbol distribution, hub symbols, most-imported files, and suggested queries",
    parameters: GraphOverviewParams,
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = graphOverview({ store, projectRoot });
      output = indexingFailedNote() + output;
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
