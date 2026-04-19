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
