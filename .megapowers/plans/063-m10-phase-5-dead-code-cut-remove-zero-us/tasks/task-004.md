---
id: 4
title: Apply the zero-usage resolve_edge removal
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-tool-descriptions.test.ts
  - test/token-tracker-wiring-check.test.ts
  - test/extension-wiring.test.ts
  - test/extension-auto-index.test.ts
  - test/readonly-graceful-degradation.test.ts
  - test/tool-resolve-edge.test.ts
  - test/tool-resolve-edge-empty-evidence.test.ts
  - test/tool-resolve-edge-self-ref.test.ts
files_to_create:
  - test/phase5-resolve-edge-surface.test.ts
---

### Task 4: Apply the zero-usage resolve_edge removal [depends: 2]

**Covers:** AC5, AC8

Run this task only when `phase5ToolDecisions.resolve_edge.decision === "delete"` in `test/phase5-decision-matrix.ts`.
**Files:**
- Create: `test/phase5-resolve-edge-surface.test.ts`
- Modify: `src/index.ts`
- Modify: `test/extension-tool-descriptions.test.ts`
- Modify: `test/token-tracker-wiring-check.test.ts`
- Modify: `test/extension-wiring.test.ts`
- Modify: `test/extension-auto-index.test.ts`
- Modify: `test/readonly-graceful-degradation.test.ts`
- Delete: `test/tool-resolve-edge.test.ts`
- Delete: `test/tool-resolve-edge-empty-evidence.test.ts`
- Delete: `test/tool-resolve-edge-self-ref.test.ts`
- Test: `test/phase5-resolve-edge-surface.test.ts`
**Step 1 — Write the failing test**
Create `test/phase5-resolve-edge-surface.test.ts` with:

```ts
import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";

test("pi extension omits resolve_edge when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("resolve_edge")) return;
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

  if (registeredTools.some((tool) => tool.name === "resolve_edge")) {
    throw new Error("resolve_edge is still registered after the Phase 5 cut");
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/phase5-resolve-edge-surface.test.ts`
Expected: FAIL — `error: resolve_edge is still registered after the Phase 5 cut`
**Step 3 — Write minimal implementation**
1. In `src/index.ts`, remove the `resolveEdge` import, the `ResolveEdgeParams` schema, and the `pi.registerTool({ name: "resolve_edge", ... })` block. That block currently calls `resolveEdge({ source, target, sourceFile, targetFile, kind, evidence, store, projectRoot })`, so removing the registration must also remove the now-unused schema and import.
2. Replace `test/extension-tool-descriptions.test.ts` with the decision-matrix-driven version below so public-surface descriptions automatically drop `resolve_edge` when it is deleted:

```ts
import { test } from "bun:test";
import { expectedDefaultPublicToolDescriptions } from "./phase5-decision-matrix.js";
test("pi extension registers the approved descriptions for the default public tools", async () => {
  const expected = expectedDefaultPublicToolDescriptions;
  const expectedIncludeDescription =
    'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.';
  const registeredTools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
      registeredTools.push(tool);
    },
    on() {},
  };
  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
  mod.default(mockPi as any);
  const names = registeredTools.map((tool) => tool.name).sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(`registered tool list mismatch: ${names.join(",")}`);
  }
  for (const tool of registeredTools) {
    if (!tool.description.trim()) throw new Error(`empty description for ${tool.name}`);
    const wanted = expected.get(tool.name);
    if (!wanted) throw new Error(`unexpected tool registered: ${tool.name}`);
    if (tool.description !== wanted) {
      throw new Error(`description mismatch for ${tool.name}: ${tool.description}`);
    }
  }
  const symbolGraph = registeredTools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraph) throw new Error("symbol_graph was not registered");
  const includeDescription = symbolGraph.parameters?.properties?.include?.description;
  if (includeDescription !== expectedIncludeDescription) {
    throw new Error(`symbol_graph include description mismatch: ${includeDescription}`);
  }
});
```

3. Replace `test/token-tracker-wiring-check.test.ts` with:

```ts
import { expect, test } from "bun:test";
import { expectedDefaultPublicTools } from "./phase5-decision-matrix.js";
test("the default public tools are registered in the pi extension", async () => {
  const tools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      tools.push(tool);
    },
    on() {},
  };
  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);
  for (const name of expectedDefaultPublicTools) {
    expect(tools.find((tool) => tool.name === name)).toBeDefined();
  }
});
```

4. In `test/extension-wiring.test.ts`, add `import { isRemoved } from "./phase5-decision-matrix.js";` and wrap only the current `resolve_edge` schema test:

```ts
if (!isRemoved("resolve_edge")) {
  test("pi extension registers resolve_edge tool with correct schema", async () => {
    // keep the current test body unchanged
  });
}
```

5. Replace the first test in `test/extension-auto-index.test.ts` with the `impact`-based singleton check below. This uses the current `resetStoreForTesting(): void`, `getSharedStoreForTesting(): GraphStore | null`, and `impact({ symbols, changeType, store, projectRoot, maxDepth? })` signatures that already exist in `src/index.ts` and `src/tools/impact.ts`:

```ts
test("extension shares singleton store instance across symbol_graph and impact", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-singleton-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src/alpha.ts"),
    "export function alpha() {}\nexport function beta() { alpha(); }\n",
  );

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    let sgExecute: Function | undefined;
    let impactExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
        if (tool.name === "impact") impactExecute = tool.execute;
      },
      on() {},
    };
    mod.default(mockPi as any);
    const ctx = { cwd: projectRoot };
    await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
    const first = mod.getSharedStoreForTesting();
    await impactExecute!(
      "call-2",
      { symbols: ["alpha"], changeType: "behavior_change" },
      undefined,
      undefined,
      ctx,
    );
    const second = mod.getSharedStoreForTesting();
    expect(first).toBeDefined();
    expect(second).toBe(first);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

6. In `test/readonly-graceful-degradation.test.ts`, add `import { isRemoved } from "./phase5-decision-matrix.js";` and wrap only the current `resolve_edge returns clear error message on readonly DB instead of crashing` test in `if (!isRemoved("resolve_edge")) { ... }`.
7. Delete the pure `resolve_edge` test files: `test/tool-resolve-edge.test.ts`, `test/tool-resolve-edge-empty-evidence.test.ts`, and `test/tool-resolve-edge-self-ref.test.ts`.
**Step 4 — Run test, verify it passes**
Run: `bun test test/phase5-resolve-edge-surface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing, with no remaining registration or test assertion for `resolve_edge` anywhere in the suite.
