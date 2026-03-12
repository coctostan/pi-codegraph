---
id: 2
title: Rewrite trace tool description for agent usage
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-trace-description.test.ts
---

### Task 2: Rewrite trace tool description for agent usage

**Covers:** AC5, AC6, AC7

**Files:**
- Create: `test/extension-trace-description.test.ts`
- Modify: `src/index.ts`
- Test: `test/extension-trace-description.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";

test("pi extension registers trace tool with an agent-oriented description", async () => {
  const registeredTools: Array<{
    name: string;
    description: string;
    parameters: unknown;
    execute: Function;
  }> = [];

  const mockPi = {
    registerTool(tool: {
      name: string;
      description: string;
      parameters: unknown;
      execute: Function;
    }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((tool) => tool.name === "trace");
  expect(traceTool).toBeDefined();
  expect(traceTool!.description).toBe(
    "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow one path, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
  );
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-trace-description.test.ts`
Expected: FAIL — `Expected: "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow one path, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents."` / `Received: "Return one deterministic anchored execution path for a test, symbol, or endpoint"`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the trace tool description inside the `pi.registerTool({ name: "trace", ... })` block with this exact string:

```ts
"Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow one path, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents."
```

The full trace registration block should read:

```ts
  pi.registerTool({
    name: "trace",
    label: "Trace",
    description:
      "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow one path, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
    parameters: TraceParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-trace-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
