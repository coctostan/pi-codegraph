import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { traceResult } from "../src/tools/trace.js";

test("trace appends inline role tags to coverage and static step lines without changing mode header", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-signals-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function prod() { return helper(); }\nexport function helper() { return 1; }\n");
  writeFileSync(join(projectRoot, "test", "app.test.ts"), "export function prodTest() { return prod(); }\n");

  const store = new SqliteGraphStore();
  try {
    store.markCoverageIndexed();
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

    const output = traceResult({ entry: "prod", file: "src/app.ts", store, projectRoot }).text;
    const lines = output.trim().split("\n");

    expect(lines[0]).toBe("Trust: partial");
    expect(output).toMatch(/^mode: coverage \(.*\) \[stale\]$/m);
    expect(lines.some((line) => /src\/app\.ts  1:[0-9a-f]{3}  prod  function \[stale\] \[entry-point, tested\]/.test(line))).toBe(true);
    expect(lines.some((line) => /src\/app\.ts  2:[0-9a-f]{3}  helper  function \[stale\] \[leaf, untested\]/.test(line))).toBe(true);
    // The test case's own line: its report covered `prod` and `helper`, and a test takes no coverage tag.
    expect(lines.find((line) => line.includes("  prodTest  test"))).toMatch(/^test\/app\.test\.ts  1:[0-9a-f]{3}  prodTest  test( \[stale\])?$/);
    expect(output).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("trace tags no node a leaf when its calls are all unresolved", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-unresolved-leaf-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "io.ts"), "export function open() { return missing(); }\n");

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/io.ts::open:1", kind: "function", name: "open", file: "src/io.ts", start_line: 1, end_line: 1, content_hash: "h-io", is_exported: true });
    store.addEdge({
      source: "src/io.ts::open:1",
      target: "__unresolved__::missing:0",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "missing:1:33", content_hash: "h-io" },
      created_at: 1,
      call_end: { line: 1, col: 41 },
    });

    const tree = traceResult({ entry: "open", store, projectRoot }).text.split("\n").filter((line) => /^\s*(src|\?)/.test(line));
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatch(/^src\/io\.ts  1:[0-9a-f]{3}  open( \[stale\])? \[entry-point\]$/);
    expect(tree[1]).toBe("  ? missing (unresolved, src/io.ts:1)");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
