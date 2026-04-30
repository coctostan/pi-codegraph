import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { stripTrustHeader } from "../src/output/read-only-ceremony.js";
import { renderLegacyNeighborhoodBody, symbolGraph } from "../src/tools/symbol-graph.js";


test("symbol_graph schema accepts only neighborhood, contract, and source includes", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;


  resetStoreForTesting();
  piCodegraph(mockPi);


  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");


  const schema = tool.parameters as any;
  expect(Value.Check(schema, { name: "foo", include: ["neighborhood"] })).toBe(true);
  expect(Value.Check(schema, { name: "foo", include: ["contract"] })).toBe(true);
  expect(Value.Check(schema, { name: "foo", include: ["source"] })).toBe(true);
  expect(Value.Check(schema, { name: "foo", include: ["signals"] })).toBe(false);
  expect(Value.Check(schema, { name: "foo", include: ["wat"] })).toBe(false);
});
test("include:['neighborhood'] returns the byte-identical legacy body and stays the active base when combined", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-legacy-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
  writeFileSync(join(projectRoot, "src/b.ts"), "export function bar() {\n  return 1;\n}\n");


  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex("import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
    const hashB = sha256Hex("export function bar() {\n  return 1;\n}\n");


    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true, signature: "() => void" });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB, is_exported: true, signature: "() => number" });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });
    const expected = renderLegacyNeighborhoodBody({ name: "foo", store, projectRoot }).body;
    const neighborhood = stripTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood"] as any, store, projectRoot }));
    const combined = stripTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood", "contract"] as any, store, projectRoot }));


    expect(neighborhood).toBe(expected);
    expect(neighborhood.toLowerCase()).not.toContain("deprecated");
    expect(neighborhood).not.toContain("use symbol_graph instead");
    expect(neighborhood).not.toContain("symbol_card(");
    expect(neighborhood).not.toContain("symbol_contract(");
    expect(combined.startsWith(expected)).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
