import { expect, test } from "bun:test";
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

function createCoverageFixture(includeUnresolved = false): {
  projectRoot: string;
  store: SqliteGraphStore;
  prod: GraphNode;
  testNode: GraphNode;
  prodV1: string;
  testV1: string;
} {
  const projectRoot = join(tmpdir(), `pi-cg-trace-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const prodV1 = "export function prod() { return 1; }\n";
  const testV1 = "export function prodTest() { return prod(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), prodV1);
  writeFileSync(join(projectRoot, "src", "app.test.ts"), testV1);
  const prodHash = sha256Hex(prodV1);
  const testHash = sha256Hex(testV1);
  const store = new SqliteGraphStore();
  const prod: GraphNode = { id: "src/app.ts::prod:1", kind: "function", name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: prodHash };
  const testNode: GraphNode = { id: "src/app.test.ts::prodTest:1", kind: "test", name: "prodTest", file: "src/app.test.ts", start_line: 1, end_line: 1, content_hash: testHash };

  store.addNode(prod);
  store.addNode(testNode);
  store.addEdge({ source: prod.id, target: testNode.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "prod", content_hash: prodHash }, created_at: 1 });
  store.setFileHash("src/app.ts", prodHash);
  store.setFileHash("src/app.test.ts", testHash);
  store.saveTestTrace({
    testNodeId: testNode.id,
    steps: [
      { nodeId: testNode.id, ordinal: 0, contentHash: testHash },
      { nodeId: prod.id, ordinal: 1, contentHash: prodHash },
      ...(includeUnresolved ? [{ nodeId: "src/app.ts::removed:9", ordinal: 2, contentHash: "old-removed-hash" }] : []),
    ],
  });
  return { projectRoot, store, prod, testNode, prodV1, testV1 };
}

test("trace reports unknown freshness for unresolved stored coverage steps", () => {
  const fixture = createCoverageFixture(true);
  try {
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store: fixture.store, projectRoot: fixture.projectRoot });
    expect(output).toContain("Trust: unknown");
    expect(output).toContain("trace path may be unreliable; refresh index before relying on this result");
    expect(output).toContain("src/app.ts::removed:9  unresolved [stale]");
  } finally {
    fixture.store.close();
    rmSync(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("trace reports changed files and row-level stale markers for stale stored trace steps", () => {
  const fixture = createCoverageFixture(false);
  try {
    writeFileSync(join(fixture.projectRoot, "src", "app.ts"), "export function prod() { return 2; }\n");
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store: fixture.store, projectRoot: fixture.projectRoot });
    expect(output).toContain("Trust: partial");
    expect(output).toContain("changed files: src/app.ts");
    expect(output).toContain("affected symbols: prod");
    expect(output).toContain("mode: coverage [stale]");
    expect(output).toContain("prod  function [stale]");
  } finally {
    fixture.store.close();
    rmSync(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("trace reports deleted files for stored trace steps whose files were removed", () => {
  const fixture = createCoverageFixture(false);
  try {
    unlinkSync(join(fixture.projectRoot, "src", "app.ts"));
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store: fixture.store, projectRoot: fixture.projectRoot });
    expect(output).toContain("Trust: partial");
    expect(output).toContain("deleted files: src/app.ts");
    expect(output).toContain("mode: coverage [stale]");
  } finally {
    fixture.store.close();
    rmSync(fixture.projectRoot, { recursive: true, force: true });
  }
});
