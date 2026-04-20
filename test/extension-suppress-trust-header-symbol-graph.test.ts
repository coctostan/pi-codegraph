import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
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
test("symbol_graph schema advertises suppressTrustHeader as an optional boolean", () => {
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");
  const schema = tool.parameters as any;
  const prop = schema.properties.suppressTrustHeader;
  if (!prop) throw new Error("symbol_graph schema is missing suppressTrustHeader");
  expect(prop.type).toBe("boolean");
  const required: string[] = schema.required ?? [];
  expect(required.includes("suppressTrustHeader")).toBe(false);
});

test("symbol_graph with suppressTrustHeader:true omits the Trust header on a stale graph", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-suppress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const original = "export function bar() { return 1; }\nexport function foo() { return bar(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);

  // Seed the persisted store so a readonly-DB + mutated-source path produces status: stale.
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "graph.db");
  const seed = new SqliteGraphStore(dbPath);
  const extracted = extractFile("src/app.ts", original);
  seed.addNode(extracted.module);
  for (const node of extracted.nodes) seed.addNode(node);
  for (const edge of extracted.edges) seed.addEdge(edge);
  seed.setFileHash("src/app.ts", sha256Hex(original));
  seed.close();
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 2; }\nexport function foo() { return bar(); }\n",
  );
  chmodSync(dbPath, 0o444);

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const baseline = await (tool as any).execute(
      "baseline",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    expect(baselineText).toContain("## Trust\nstatus: stale");
    expect(baselineText).toContain("## foo (function)");
    const suppressed = await (tool as any).execute(
      "suppressed",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toContain("## foo (function)");
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
