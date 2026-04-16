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
