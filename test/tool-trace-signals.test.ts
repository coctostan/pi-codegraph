import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace appends inline role tags to coverage and static step lines without changing mode header", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-signals-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function prod() { return helper(); }\nexport function helper() { return 1; }\n");
  writeFileSync(join(projectRoot, "test", "app.test.ts"), "export function prodTest() { return prod(); }\n");

  const store = new SqliteGraphStore();
  try {
    const testNode = { id: "test/app.test.ts::prodTest:1", kind: "test" as const, name: "prodTest", file: "test/app.test.ts", start_line: 1, end_line: 1, content_hash: "h-test", is_exported: false };
    const prod = { id: "src/app.ts::prod:1", kind: "function" as const, name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h-app", is_exported: true };
    const helper = { id: "src/app.ts::helper:2", kind: "function" as const, name: "helper", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: "h-app", is_exported: false };

    store.addNode(testNode);
    store.addNode(prod);
    store.addNode(helper);

    store.addEdge({
      source: prod.id,
      target: helper.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "helper", content_hash: "h" },
      created_at: 1,
    });
    store.addEdge({
      source: prod.id,
      target: testNode.id,
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 1, evidence: "v8", content_hash: "h" },
      created_at: 2,
    });

    store.saveTestTrace({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: testNode.content_hash },
        { nodeId: prod.id, ordinal: 1, contentHash: prod.content_hash },
        { nodeId: helper.id, ordinal: 2, contentHash: helper.content_hash },
      ],
    });

    const output = trace({ entry: "prod", file: "src/app.ts", store, projectRoot });
    const lines = output.trim().split("\n");

    expect(lines[0]).toBe("## Trust");
    expect(lines[3]).toBe("mode: coverage [stale]");
    expect(lines.some((line) => /src\/app\.ts:1:[0-9a-f]{4}  prod  function \[stale\] \[entry-point, tested\]/.test(line))).toBe(true);
    expect(lines.some((line) => /src\/app\.ts:2:[0-9a-f]{4}  helper  function \[stale\] \[leaf, untested\]/.test(line))).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
