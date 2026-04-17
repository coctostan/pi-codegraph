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
