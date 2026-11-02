import { test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";

function registerTools() {
  const tools: Array<{ name: string; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; execute: Function }) {
      tools.push(tool);
    },
    on() {},
  };
  resetStoreForTesting();
  piCodegraph(mockPi as any);
  return tools;
}

function createFreshProject(): string {
  const projectRoot = join(tmpdir(), `pi-cg-trust-gating-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );
  return projectRoot;
}

test("fresh symbol_graph tool calls omit the Trust header but keep provenance and signal lines", async () => {
  const projectRoot = createFreshProject();
  const tools = registerTools();
  const symbolGraphTool = tools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraphTool) throw new Error("symbol_graph tool was not registered");

  try {
    const result = await symbolGraphTool.execute(
      "call-1",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;

    if (!text.startsWith("Trust: fresh\n## foo (function)")) {
      throw new Error(`fresh read-only output lost the Trust header/body: ${text}`);
    }
    if (!/src\/app\.ts  2:[0-9a-f]{3}/.test(text)) {
      throw new Error("fresh read-only output lost the anchored body line");
    }
    if (!text.includes("leaf") || !text.includes("untested")) {
      throw new Error("fresh read-only output lost signal tags");
    }
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("non-fresh trace tool calls still render the Trust header", async () => {
  const projectRoot = createFreshProject();
  const tools = registerTools();
  const traceTool = tools.find((tool) => tool.name === "trace");
  if (!traceTool) throw new Error("trace tool was not registered");

  try {
    const result = await traceTool.execute(
      "call-2",
      { entry: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;

    if (!text.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")) {
      throw new Error(`non-fresh trace output lost the Trust header: ${text}`);
    }
    if (!text.includes("mode: static (heuristic, no runtime evidence)")) {
      throw new Error("non-fresh trace output lost the trace body");
    }
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
