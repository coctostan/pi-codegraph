import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";

function register(): ToolDefinition<any>[] {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;
  resetStoreForTesting();
  piCodegraph(mockPi);
  return tools;
}

test("trace schema advertises suppressTrustHeader as an optional boolean", () => {
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "trace");
  if (!tool) throw new Error("trace was not registered");
  const schema = tool.parameters as any;
  const prop = schema.properties.suppressTrustHeader;
  if (!prop) throw new Error("trace schema is missing suppressTrustHeader");
  expect(prop.type).toBe("boolean");
  const required: string[] = schema.required ?? [];
  expect(required.includes("suppressTrustHeader")).toBe(false);
});

test("trace with suppressTrustHeader:true omits the non-fresh Trust header", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-suppress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "trace");
  if (!tool) throw new Error("trace was not registered");

  try {
    const suppressed = await (tool as any).execute(
      "call-1",
      { entry: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText.includes("Trust: ")).toBe(false);
    expect(suppressedText).toContain("mode: static (heuristic, no runtime evidence)");

    const baseline = await (tool as any).execute(
      "call-2",
      { entry: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    expect(baselineText.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")).toBe(true);
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
