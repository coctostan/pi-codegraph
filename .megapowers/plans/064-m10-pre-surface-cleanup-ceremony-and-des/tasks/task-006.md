---
id: 6
title: Normalize the remaining tool descriptions
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-symbol-search.test.ts
files_to_create:
  - test/extension-tool-descriptions.test.ts
---

### Task 6: Normalize the remaining tool descriptions [depends: 5]

**Files:**
- Modify: `src/index.ts`
- Modify: `test/extension-symbol-search.test.ts`
- Test: `test/extension-tool-descriptions.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-tool-descriptions.test.ts` with this exact content:

```ts
import { test } from "bun:test";

test("pi extension registers the approved descriptions for all 11 tools", async () => {
  const expected = new Map<string, string>([
    ["symbol_graph", "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol."],
    ["resolve_edge", "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs."],
    ["delete_edge", "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete."],
    ["impact", "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code."],
    ["trace", "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs."],
    ["graph_query", "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query."],
    ["symbol_card", "Return a compact symbol summary with definition, signature, tests, relationships, and signals."],
    ["symbol_contract", "Return a symbol's behavioral contract from code and tests.\nWhen to use: You need inputs, outputs, throws, or asserted behavior."],
    ["graph_overview", "Return a high-level overview of the indexed codebase.\nWhen to use: You need hotspots, distributions, and suggested starting points."],
    ["dead_code", "Find unreferenced exported symbols or check whether a symbol is still referenced.\nWhen to use: You are looking for cleanup candidates."],
    ["symbol_search", "Find symbols by approximate name match.\nWhen to use: You know roughly what a symbol is called but not its exact name or file."],
  ]);

  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
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
    if (!tool.description.trim()) {
      throw new Error(`empty description for ${tool.name}`);
    }
    const wanted = expected.get(tool.name);
    if (!wanted) {
      throw new Error(`unexpected tool registered: ${tool.name}`);
    }
    if (tool.description !== wanted) {
      throw new Error(`description mismatch for ${tool.name}: ${tool.description}`);
    }
  }
});
```

Replace the first test in `test/extension-symbol-search.test.ts` with this exact content, leaving the execution test unchanged:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { resetSearchCacheForTesting } from "../src/tools/symbol-search.js";

test("symbol_search tool is registered in the extension with the approved description", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;

  resetStoreForTesting();
  resetSearchCacheForTesting();
  piCodegraph(mockPi);

  const searchTool = tools.find((t) => t.name === "symbol_search");
  if (!searchTool) {
    throw new Error("symbol_search tool was not registered");
  }

  const expected = "Find symbols by approximate name match.\nWhen to use: You know roughly what a symbol is called but not its exact name or file.";
  if (searchTool.description !== expected) {
    throw new Error(`symbol_search description mismatch: ${searchTool.description}`);
  }
});

test("symbol_search tool executes and returns results", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-ext-search-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/hello.ts"), "export function helloWorld() { return 1; }\n");

  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;

  resetStoreForTesting();
  resetSearchCacheForTesting();
  piCodegraph(mockPi);

  const searchTool = tools.find((t) => t.name === "symbol_search")!;

  try {
    const result = await searchTool.execute("call-1", { query: "hello world" }, undefined as any, () => {}, { cwd: projectRoot } as any);
    const text = (result.content[0] as any).text as string;
    expect(text).toContain("helloWorld");
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-tool-descriptions.test.ts test/extension-symbol-search.test.ts`
Expected: FAIL — `Error: description mismatch for symbol_graph: Look up a symbol and return its anchored neighborhood`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the remaining description strings with these exact values:

```ts
// symbol_graph
description:
  "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol.",

// resolve_edge
description:
  "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs.",

// delete_edge
description:
  "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete.",

// impact
description:
  "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code.",

// symbol_card
description:
  "Return a compact symbol summary with definition, signature, tests, relationships, and signals.",

// symbol_contract
description:
  "Return a symbol's behavioral contract from code and tests.\nWhen to use: You need inputs, outputs, throws, or asserted behavior.",

// graph_overview
description:
  "Return a high-level overview of the indexed codebase.\nWhen to use: You need hotspots, distributions, and suggested starting points.",

// dead_code
description:
  "Find unreferenced exported symbols or check whether a symbol is still referenced.\nWhen to use: You are looking for cleanup candidates.",

// symbol_search
description:
  "Find symbols by approximate name match.\nWhen to use: You know roughly what a symbol is called but not its exact name or file.",
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-tool-descriptions.test.ts test/extension-symbol-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing
