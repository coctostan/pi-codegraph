import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace marks stale and unresolved stored steps without failing the whole trace", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function prod() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "app.test.ts"), "export function prodTest() { return prod(); }\n");

  const store = new SqliteGraphStore();
  try {
    const prod = { id: "src/app.ts::prod:1", kind: "function" as const, name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "old-app-hash" };
    const testNode = { id: "src/app.test.ts::prodTest:1", kind: "test" as const, name: "prodTest", file: "src/app.test.ts", start_line: 1, end_line: 1, content_hash: "old-test-hash" };

    store.addNode(testNode);
    store.addEdge({ source: prod.id, target: testNode.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "prod", content_hash: "old-app-hash" }, created_at: 1 });
    store.saveTestTrace({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: "old-test-hash" },
        { nodeId: prod.id, ordinal: 1, contentHash: "old-app-hash" },
        { nodeId: "src/app.ts::removed:9", ordinal: 2, contentHash: "old-removed-hash" },
      ],
    });

    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store, projectRoot });
    expect(output).toContain("mode: coverage [stale]");
    expect(output).toContain("src/app.test.ts:1:");
    expect(output).toContain("[stale]");
    expect(output).toContain("src/app.ts::removed:9  unresolved [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
