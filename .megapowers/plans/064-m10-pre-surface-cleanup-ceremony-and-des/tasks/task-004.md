---
id: 4
title: Normalize the `trace` description
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-trace-description.test.ts
files_to_create: []
---

### Task 4: Normalize the `trace` description [depends: 3]

**Files:**
- Modify: `src/index.ts`
- Test: `test/extension-trace-description.test.ts`

**Step 1 — Write the failing test**
Replace `test/extension-trace-description.test.ts` with this exact content:

```ts
import { test } from "bun:test";

test("pi extension registers trace with the approved description", async () => {
  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((tool) => tool.name === "trace");
  if (!traceTool) {
    throw new Error("trace tool was not registered");
  }

  const expected = "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.";
  if (traceTool.description !== expected) {
    throw new Error(`trace description mismatch: ${traceTool.description}`);
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-trace-description.test.ts`
Expected: FAIL — `Error: trace description mismatch: Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the `trace` description with this exact string:

```ts
description:
  "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.",
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-trace-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing
