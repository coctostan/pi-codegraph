import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { computeAnchor } from "../src/output/anchoring.js";
import { impact } from "../src/tools/impact.js";

test("computeAnchor returns existing anchor format file:line:hash and stale flag", () => {
  const root = join(tmpdir(), `pi-cg-anchor-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "f.ts"), "export function a() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/f.ts::a:1", kind: "function", name: "a", file: "src/f.ts", start_line: 1, end_line: 1, content_hash: "h" });
    const node = store.getNode("src/f.ts::a:1")!;
    const result = computeAnchor(node, root);
    expect(result.anchor).toMatch(/^src\/f\.ts:1:[0-9a-f]{4}$/);
    expect(typeof result.stale).toBe("boolean");

    const staleProbe = { ...node, start_line: 99, end_line: 99 };
    const staleResult = computeAnchor(staleProbe as any, root);
    expect(staleResult.stale).toBe(true);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("impact() emits anchored structured lines and empty string for no-impact", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "caller.ts"), "import { shared } from './shared';\nexport function caller() { return shared(); }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: "h" });
    store.addNode({ id: "src/caller.ts::caller:2", kind: "function", name: "caller", file: "src/caller.ts", start_line: 2, end_line: 2, content_hash: "h" });
    store.addEdge({
      source: "src/caller.ts::caller:2",
      target: "src/shared.ts::shared:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "shared:2:35", content_hash: "h" },
      created_at: 1,
    });
    const out = impact({ symbols: ["shared"], changeType: "signature_change", store, projectRoot, maxDepth: 3 });
    expect(out.trim().split("\n")).toHaveLength(1);
    expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?$/);
    // AC 11 strict contract: file:line:hash + two-space field separators + trailing newline.
    expect(out).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?\n$/);
    const noImpact = impact({ symbols: ["shared"], changeType: "addition", store, projectRoot, maxDepth: 3 });
    expect(noImpact).toBe("");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('pi extension default export registers tool name "impact" with symbols/changeType schema', async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = { registerTool(tool: any) { registeredTools.push(tool); }, on() {} };
  const { default: piCodegraph } = await import("../src/index.js");
  expect(typeof piCodegraph).toBe("function");
  piCodegraph(mockPi as any);
  const impactTool = registeredTools.find((tool) => tool.name === "impact");
  expect(impactTool).toBeDefined();
  const schema = impactTool!.parameters as any;
  expect(schema.properties.symbols).toBeDefined();
  expect(schema.properties.changeType).toBeDefined();
  expect(schema.properties.maxDepth).toBeDefined();
});
