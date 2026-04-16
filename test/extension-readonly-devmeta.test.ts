import { test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";

function createProject(): string {
  const projectRoot = join(tmpdir(), `pi-cg-devmeta-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );
  return projectRoot;
}

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

test("CODEGRAPH_DEVMETA gates _meta per call without restart", async () => {
  const projectRoot = createProject();
  const previous = process.env.CODEGRAPH_DEVMETA;
  const tools = registerTools();
  const symbolGraphTool = tools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraphTool) throw new Error("symbol_graph tool was not registered");

  try {
    delete process.env.CODEGRAPH_DEVMETA;
    const offResult = await symbolGraphTool.execute(
      "call-1",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const offText = (offResult.content[0] as any).text as string;
    if (offText.includes("_meta:")) {
      throw new Error("read-only output rendered _meta without CODEGRAPH_DEVMETA");
    }

    process.env.CODEGRAPH_DEVMETA = "1";
    const onResult = await symbolGraphTool.execute(
      "call-2",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const onText = (onResult.content[0] as any).text as string;
    if (!onText.includes("_meta:")) {
      throw new Error("read-only output did not render _meta when CODEGRAPH_DEVMETA=1");
    }

    delete process.env.CODEGRAPH_DEVMETA;
    const toggledOffResult = await symbolGraphTool.execute(
      "call-3",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const toggledOffText = (toggledOffResult.content[0] as any).text as string;
    if (toggledOffText.includes("_meta:")) {
      throw new Error("read-only output cached CODEGRAPH_DEVMETA across calls");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMETA;
    else process.env.CODEGRAPH_DEVMETA = previous;
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
