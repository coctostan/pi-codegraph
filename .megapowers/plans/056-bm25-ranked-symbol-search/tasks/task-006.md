---
id: 6
title: Register symbol_search tool in pi extension
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-symbol-search.test.ts
---

### Task 6: Register symbol_search tool in pi extension [depends: 4]

**Files:**
- Modify: `src/index.ts`
- Create: `test/extension-symbol-search.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/extension-symbol-search.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { resetSearchCacheForTesting } from "../src/tools/symbol-search.js";

test("symbol_search tool is registered in the extension", () => {
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
  expect(searchTool).toBeDefined();
  expect(searchTool!.name).toBe("symbol_search");
  expect(searchTool!.description).toContain("search");
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
    const text = result.content[0].text as string;
    expect(text).toContain("helloWorld");
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-symbol-search.test.ts`
Expected: FAIL — `expect(searchTool).toBeDefined()` fails because `symbol_search` is not yet registered

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at top:
```typescript
import { symbolSearch, resetSearchCacheForTesting as _resetSearchCache } from "./tools/symbol-search.js";
```

2. Add params schema after `DeadCodeParams`:
```typescript
const SymbolSearchParams = Type.Object({
  query: Type.String({ description: "Search query (free text, supports partial names)" }),
  kind: Type.Optional(Type.String({ description: "Filter by symbol kind (function, class, interface, etc.)" })),
  file: Type.Optional(Type.String({ description: "Filter by file glob pattern (e.g. src/tools/*)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum results to return (default: 20)" })),
});
```

3. Add `_resetSearchCache()` call inside `resetStoreForTesting()`.

4. Register the tool inside `piCodegraph()`, before the closing `}`:
```typescript
  registerReadOnlyTool(pi, {
    name: "symbol_search",
    label: "Symbol Search",
    description: "Search symbols by approximate name using BM25 ranked scoring. Tokenizes camelCase/snake_case queries and scores against symbol name, signature, and file path.",
    parameters: SymbolSearchParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = symbolSearch({
        query: params.query,
        kind: params.kind as any,
        file: params.file,
        limit: params.limit,
        store,
        projectRoot,
      });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_search", { query: params.query }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-symbol-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
