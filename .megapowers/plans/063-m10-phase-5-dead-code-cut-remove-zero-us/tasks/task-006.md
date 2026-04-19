---
id: 6
title: Apply the zero-usage graph_query removal
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/index.ts
  - src/tools/token-tracker.ts
  - test/extension-devmode-tools.test.ts
  - test/extension-graph-query-description.test.ts
  - test/extension-graph-query.test.ts
  - test/extension-readonly-trust-gating.test.ts
  - test/readonly-graceful-degradation.test.ts
  - test/tool-graph-query-edge-where.test.ts
  - test/tool-graph-query-empty-query.test.ts
  - test/tool-graph-query-execution-error-detail.test.ts
  - test/tool-graph-query-execution-error.test.ts
  - test/tool-graph-query-invalid-suggestion.test.ts
  - test/tool-graph-query-node.test.ts
  - test/tool-graph-query-render-edge.test.ts
  - test/tool-graph-query-render-empty.test.ts
  - test/tool-graph-query-render-node.test.ts
  - test/tool-graph-query-render-stale.test.ts
  - test/tool-graph-query-single-quote-where.test.ts
  - test/tool-graph-query-traversal-edge-alias.test.ts
  - test/tool-graph-query-traversal-no-edge-alias.test.ts
  - test/tool-graph-query-trust-header.test.ts
  - test/tool-graph-query-unsupported-suggestion.test.ts
files_to_create:
  - test/phase5-graph-query-surface.test.ts
---

### Task 6: Apply the zero-usage graph_query removal [depends: 2]

**Covers:** AC6, AC8

Run this task only when `phase5ToolDecisions.graph_query.decision === "delete"` in `test/phase5-decision-matrix.ts`.
**Files:**
- Create: `test/phase5-graph-query-surface.test.ts`
- Modify: `src/index.ts`
- Modify: `src/tools/token-tracker.ts`
- Modify: `test/extension-devmode-tools.test.ts`
- Modify: `test/extension-graph-query-description.test.ts`
- Modify: `test/extension-graph-query.test.ts`
- Modify: `test/extension-readonly-trust-gating.test.ts`
- Modify: `test/readonly-graceful-degradation.test.ts`
- Delete: `test/tool-graph-query-*.test.ts`
- Test: `test/phase5-graph-query-surface.test.ts`

**Step 1 — Write the failing test**
Create `test/phase5-graph-query-surface.test.ts` with:

```ts
import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";

test("pi extension omits graph_query when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("graph_query")) return;

  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
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

    if (registeredTools.some((tool) => tool.name === "graph_query")) {
      throw new Error("graph_query is still registered after the Phase 5 cut");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/phase5-graph-query-surface.test.ts`
Expected: FAIL — `error: graph_query is still registered after the Phase 5 cut`

**Step 3 — Write minimal implementation**
1. In `src/index.ts`, remove the `graphQuery` import, the `GraphQueryParams` schema, and the `registerReadOnlyTool(pi, { name: "graph_query", ... })` block inside the `if (devMode)` section.
2. In `src/tools/token-tracker.ts`, remove the `case "graph_query":` label from `collectNaiveFiles()`. After this task, the grouped all-files branch should begin with `case "graph_overview":` and `case "dead_code":` only.
3. Replace `test/extension-devmode-tools.test.ts` with a helper-driven version that uses the real decision matrix for every dev tool and keeps the runtime test only when `graph_query` remains on the surface:

```ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { isRemoved, phase5ToolDecisions } from "./phase5-decision-matrix.js";

const DEV_TOOLS = ["graph_query", "graph_overview", "dead_code"] as const;
const TRUTHY_VALUES = ["1", "true", "TRUE", "yes", "On"] as const;

function withDevMode<T>(value: string | undefined, callback: () => T): T {
  const previous = process.env.CODEGRAPH_DEVMODE;
  if (value === undefined) delete process.env.CODEGRAPH_DEVMODE;
  else process.env.CODEGRAPH_DEVMODE = value;

  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
}

function registerTools(value?: string): ToolDefinition<any>[] {
  return withDevMode(value, () => {
    const tools: ToolDefinition<any>[] = [];
    const mockPi: ExtensionAPI = {
      registerTool(tool: ToolDefinition<any>) {
        tools.push(tool);
      },
    } as any;

    resetStoreForTesting();
    piCodegraph(mockPi);
    return tools;
  });
}

test("piCodegraph hides all dev-only tools by default and never re-registers them after env changes", () => {
  const previous = process.env.CODEGRAPH_DEVMODE;
  delete process.env.CODEGRAPH_DEVMODE;

  try {
    const tools: ToolDefinition<any>[] = [];
    const mockPi: ExtensionAPI = {
      registerTool(tool: ToolDefinition<any>) {
        tools.push(tool);
      },
    } as any;

    resetStoreForTesting();
    piCodegraph(mockPi);
    process.env.CODEGRAPH_DEVMODE = "1";

    for (const name of DEV_TOOLS) {
      if (tools.some((tool) => tool.name === name)) {
        throw new Error(`${name} was registered without CODEGRAPH_DEVMODE`);
      }
    }

    if (tools.some((tool) => tool.name === "symbol_search")) {
      throw new Error("symbol_search returned to the registered surface");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});

test("piCodegraph registers exactly the kept dev-only tools for every approved CODEGRAPH_DEVMODE truthy value", () => {
  for (const value of TRUTHY_VALUES) {
    const tools = registerTools(value);

    for (const name of DEV_TOOLS) {
      const exists = tools.some((tool) => tool.name === name);
      const shouldExist = phase5ToolDecisions[name].decision === "keep";
      if (exists !== shouldExist) {
        throw new Error(`${name} registration mismatch for CODEGRAPH_DEVMODE=${value}`);
      }
    }

    if (tools.some((tool) => tool.name === "symbol_search")) {
      throw new Error(`symbol_search returned when CODEGRAPH_DEVMODE=${value}`);
    }
  }
});

if (!isRemoved("graph_query")) {
  test("graph_query keeps its existing runtime behavior when dev mode is enabled", async () => {
    const projectRoot = join(tmpdir(), `pi-cg-devmode-graph-query-${Date.now()}`);
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(join(projectRoot, "src", "hello.ts"), "export function hello() { return 'world'; }\n");

    try {
      const tools = registerTools("1");
      const graphQuery = tools.find((tool) => tool.name === "graph_query");
      if (!graphQuery) {
        throw new Error("graph_query was not registered when CODEGRAPH_DEVMODE=1");
      }

      const result = await graphQuery.execute(
        "call-1",
        { query: 'MATCH (a {name: "hello"}) RETURN a' },
        undefined,
        undefined,
        { cwd: projectRoot } as any,
      );

      const text = (result.content[0] as any)?.text ?? "";
      if (!existsSync(join(projectRoot, ".codegraph", "graph.db"))) {
        throw new Error("graph_query did not auto-index under CODEGRAPH_DEVMODE");
      }
      expect(text).toContain("hello");
    } finally {
      resetStoreForTesting();
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
}
```

4. Add `import { isRemoved } from "./phase5-decision-matrix.js";` and wrap every graph-query-specific test body in these files with `if (!isRemoved("graph_query")) { ... }`:
   - `test/extension-graph-query-description.test.ts`
   - `test/extension-graph-query.test.ts`
   - `test/extension-readonly-trust-gating.test.ts`
   - the graph-query-specific blocks in `test/readonly-graceful-degradation.test.ts`
5. Delete every pure graph-query assertion file: `test/tool-graph-query-edge-where.test.ts`, `test/tool-graph-query-empty-query.test.ts`, `test/tool-graph-query-execution-error-detail.test.ts`, `test/tool-graph-query-execution-error.test.ts`, `test/tool-graph-query-invalid-suggestion.test.ts`, `test/tool-graph-query-node.test.ts`, `test/tool-graph-query-render-edge.test.ts`, `test/tool-graph-query-render-empty.test.ts`, `test/tool-graph-query-render-node.test.ts`, `test/tool-graph-query-render-stale.test.ts`, `test/tool-graph-query-single-quote-where.test.ts`, `test/tool-graph-query-traversal-edge-alias.test.ts`, `test/tool-graph-query-traversal-no-edge-alias.test.ts`, `test/tool-graph-query-trust-header.test.ts`, and `test/tool-graph-query-unsupported-suggestion.test.ts`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/phase5-graph-query-surface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing, with no remaining registration or test assertion for `graph_query` anywhere in the suite.
