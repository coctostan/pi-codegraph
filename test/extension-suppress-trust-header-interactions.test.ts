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

function createProject(slug: string): string {
  const root = join(tmpdir(), `pi-cg-suppress-interactions-${slug}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );
  return root;
}

test("suppressTrustHeader:true still renders the indexing-failed note on a readonly stale DB", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-suppress-idxfail-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const original = "export function bar() { return 1; }\nexport function foo() { return bar(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);

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
    const result = await (tool as any).execute(
      "call-with-flag",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;
    expect(text.includes("## Trust")).toBe(false);
    expect(text).toMatch(/indexing-failed \(\d+s ago\): readonly database/);
    expect(text).toContain("## foo (function)");
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("suppressTrustHeader:true still appends _meta footer when CODEGRAPH_DEVMETA=1", async () => {
  const projectRoot = createProject("devmeta");
  const previous = process.env.CODEGRAPH_DEVMETA;
  process.env.CODEGRAPH_DEVMETA = "1";
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const result = await (tool as any).execute(
      "call-1",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;
    expect(text.includes("## Trust")).toBe(false);
    expect(text).toContain("_meta:");
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMETA;
    else process.env.CODEGRAPH_DEVMETA = previous;
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("suppressTrustHeader:true preserves body anchors and signals on symbol_graph (fresh graph)", async () => {
  const projectRoot = createProject("body-fresh");
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const baseline = await (tool as any).execute(
      "call-1",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    // Fresh-graph calls already have the Trust header suppressed by suppressFreshTrustHeader.
    expect(baselineText.includes("## Trust")).toBe(false);
    expect(baselineText).toContain("## foo (function)");

    const suppressed = await (tool as any).execute(
      "call-2",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText).toBe(baselineText);
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("suppressTrustHeader:true preserves body anchors and signals on symbol_graph (stale graph)", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-suppress-body-stale-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const original = "export function bar() { return 1; }\nexport function foo() { return bar(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);

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
    const baselineLines = baselineText.split("\n");
    const trustIndex = baselineLines.indexOf("## Trust");
    expect(trustIndex).toBeGreaterThanOrEqual(0);
    // Preserve any pre-body note (for example, indexing-failed) and remove only the 3-line
    // Trust block.
    const withoutTrust = [
      ...baselineLines.slice(0, trustIndex),
      ...baselineLines.slice(trustIndex + 3),
    ].join("\n");
    const suppressed = await (tool as any).execute(
      "suppressed",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toBe(withoutTrust);
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("suppressTrustHeader:false is byte-identical to omitting the flag (trace, non-fresh)", async () => {
  const projectRoot = createProject("default-trace");
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "trace");
  if (!tool) throw new Error("trace was not registered");

  try {
    const omitted = await (tool as any).execute(
      "call-1",
      { entry: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const explicit = await (tool as any).execute(
      "call-2",
      { entry: "foo", file: "src/app.ts", suppressTrustHeader: false },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const omittedText = (omitted.content[0] as any).text as string;
    const explicitText = (explicit.content[0] as any).text as string;
    expect(omittedText.startsWith("## Trust\nstatus: heuristic")).toBe(true);
    expect(explicitText).toBe(omittedText);
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
