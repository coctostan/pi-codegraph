---
id: 2
title: Demote symbol_search from the registered extension surface
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-symbol-search.test.ts
  - test/extension-tool-descriptions.test.ts
files_to_create: []
---

### Task 2: Demote symbol_search from the registered extension surface [depends: 1]

**Files:**
- Modify: `src/index.ts`
- Modify: `test/extension-symbol-search.test.ts`
- Modify: `test/extension-tool-descriptions.test.ts`

**Step 1 — Write the failing test**
Replace `test/extension-symbol-search.test.ts` with:

```ts
import { expect, test } from "bun:test";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolSearch, resetSearchCacheForTesting } from "../src/tools/symbol-search.js";

test("symbol_search is no longer registered in the extension surface", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;

  resetStoreForTesting();
  resetSearchCacheForTesting();
  piCodegraph(mockPi);

  if (tools.some((tool) => tool.name === "symbol_search")) {
    throw new Error("symbol_search was still registered in the extension surface");
  }
});

test("symbolSearch remains exported for internal callers", () => {
  const store = new SqliteGraphStore();

  try {
    store.addNode({
      id: "src/hello.ts::helloWorld:1",
      kind: "function",
      name: "helloWorld",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "hash-1",
      is_exported: true,
      signature: "() => number",
    });

    const text = symbolSearch({
      query: "hello world",
      store,
      projectRoot: ".",
    });

    expect(text).toContain("helloWorld");
    expect(text).toContain("src/hello.ts:1");
  } finally {
    resetSearchCacheForTesting();
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-symbol-search.test.ts`
Expected: FAIL — `Error: symbol_search was still registered in the extension surface`

**Step 3 — Write minimal implementation**
In `src/index.ts`:

1. Narrow the symbol-search import so `resetStoreForTesting()` still works but registration code no longer needs the tool function:

```ts
import { resetSearchCacheForTesting as _resetSearchCache } from "./tools/symbol-search.js";
```

2. Delete the unused `SymbolSearchParams` schema block.

3. Delete the entire `registerReadOnlyTool(pi, { name: "symbol_search", ... })` block at the end of `piCodegraph(pi)`.

Update `test/extension-tool-descriptions.test.ts` so the default registered-tool list no longer includes `symbol_search`:

```ts
import { test } from "bun:test";

test("pi extension registers the approved descriptions for the 10 currently registered tools", async () => {
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

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-symbol-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
