---
id: 5
title: Apply the zero-usage delete_edge removal
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-tool-descriptions.test.ts
  - test/token-tracker-wiring-check.test.ts
  - test/extension-wiring.test.ts
  - test/tool-delete-edge.test.ts
files_to_create:
  - test/phase5-delete-edge-surface.test.ts
---

### Task 5: Apply the zero-usage delete_edge removal [depends: 2]

**Covers:** AC5, AC8

Run this task only when `phase5ToolDecisions.delete_edge.decision === "delete"` in `test/phase5-decision-matrix.ts`.
**Files:**
- Create: `test/phase5-delete-edge-surface.test.ts`
- Modify: `src/index.ts`
- Modify: `test/extension-tool-descriptions.test.ts`
- Modify: `test/token-tracker-wiring-check.test.ts`
- Modify: `test/extension-wiring.test.ts`
- Delete: `test/tool-delete-edge.test.ts`
- Test: `test/phase5-delete-edge-surface.test.ts`
**Step 1 — Write the failing test**
Create `test/phase5-delete-edge-surface.test.ts` with:

```ts
import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";
test("pi extension omits delete_edge when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("delete_edge")) return;
    const registeredTools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };
    const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    mod.default(mockPi as any);
  if (registeredTools.some((tool) => tool.name === "delete_edge")) {
    throw new Error("delete_edge is still registered after the Phase 5 cut");
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/phase5-delete-edge-surface.test.ts`
Expected: FAIL — `error: delete_edge is still registered after the Phase 5 cut`
**Step 3 — Write minimal implementation**
1. In `src/index.ts`, remove the `deleteEdge` import, the `DeleteEdgeParams` schema, and the `pi.registerTool({ name: "delete_edge", ... })` block. That block currently calls `deleteEdge({ source, target, sourceFile, targetFile, kind, store, projectRoot })`, so the schema and import must disappear with the registration.
2. Replace `test/extension-tool-descriptions.test.ts` with the decision-matrix-driven file that imports `expectedDefaultPublicToolDescriptions` from `./phase5-decision-matrix.js`, compares the registered tool names to `expected.keys()`, and verifies the exact `symbol_graph` include-description text.
3. Replace `test/token-tracker-wiring-check.test.ts` with the decision-matrix-driven file that imports `expectedDefaultPublicTools` from `./phase5-decision-matrix.js` and asserts every expected default public tool is registered.
4. In `test/extension-wiring.test.ts`, add `import { isRemoved } from "./phase5-decision-matrix.js";` if it is not already present, and wrap only the current `delete_edge` schema test:

```ts
if (!isRemoved("delete_edge")) {
  test("pi extension registers delete_edge tool with correct schema", async () => {
    // keep the current test body unchanged
  });
}
```

5. Delete `test/tool-delete-edge.test.ts`, because it is a pure `delete_edge` assertion file and AC8 requires removed tools to disappear from the asserted surface entirely.
**Step 4 — Run test, verify it passes**
Run: `bun test test/phase5-delete-edge-surface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing, with no remaining registration or test assertion for `delete_edge` anywhere in the suite.
