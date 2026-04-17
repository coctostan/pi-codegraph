import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { computeAnchor } from "../src/output/anchoring.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbol_graph accepts include:[\"contract\"] in the schema and keeps default output byte-identical", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;

  resetStoreForTesting();
  piCodegraph(mockPi);

  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) {
    throw new Error("symbol_graph was not registered");
  }

  const schema = tool.parameters as any;
  if (!schema.properties.include) {
    throw new Error("symbol_graph schema is missing include");
  }
  if (!Value.Check(schema, { name: "foo", include: ["contract"] })) {
    throw new Error('symbol_graph schema rejected include=["contract"]');
  }
  if (Value.Check(schema, { name: "foo", include: ["neighborhood"] })) {
    throw new Error('symbol_graph schema accepted include=["neighborhood"]');
  }

  const projectRoot = join(tmpdir(), `pi-cg-sg-include-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileContent = "export function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src", "a.ts"), fileContent);

  const store = new SqliteGraphStore();
  try {
    const hash = sha256Hex(fileContent);
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 3,
      content_hash: hash,
      is_exported: true,
    });

    const node = store.findNodes("foo")[0]!;
    const anchor = computeAnchor(node, projectRoot).anchor;
    const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
    expect(withoutInclude).toBe(
      `## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n## foo (function)\n${anchor} [entry-point, leaf, untested]\n`,
    );

    const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });
    expect(withEmptyInclude).toBe(withoutInclude);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
