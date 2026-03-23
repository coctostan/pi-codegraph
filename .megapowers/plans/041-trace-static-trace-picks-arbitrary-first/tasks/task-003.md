---
id: 3
title: Update trace tool description for multi-branch semantics
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-trace-description.test.ts
files_to_create: []
---

**Files:**
- Modify: `src/index.ts`
- Modify: `test/extension-trace-description.test.ts`
- Test: `test/extension-trace-description.test.ts`

**Step 1 — Write the failing test**

Update the existing description assertion in `test/extension-trace-description.test.ts` to match the new multi-branch description. Change lines 28-30:

```typescript
// test/extension-trace-description.test.ts — replace the toBe assertion (lines 28-30) with:
  expect(traceTool!.description).toBe(
    "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
  );
```

Full file after edit:

```typescript
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
    "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
  );
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/extension-trace-description.test.ts`
Expected: FAIL — `error: expect(received).toBe(expected)` — the current description says "Use trace to follow one path" but the test expects "Use trace to follow all reachable branches"

**Step 3 — Write minimal implementation**

In `src/index.ts`, update line 209 — change the description string:

```typescript
      "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
```

The only change is `"follow one path"` → `"follow all reachable branches"`.

**Step 4 — Run test, verify it passes**

Run: `bun test test/extension-trace-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing
