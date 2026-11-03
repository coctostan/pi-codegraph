import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore saves, replaces, and loads per-test coverage traces with stored content hashes", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/app.test.ts::appTest:1", kind: "test", name: "appTest", file: "src/app.test.ts", start_line: 1, end_line: 3, content_hash: "h-test" });
    store.addNode({ id: "src/app.ts::prod:1", kind: "function", name: "prod", file: "src/app.ts", start_line: 1, end_line: 3, content_hash: "h-prod" });
    store.addNode({ id: "src/app.ts::helper:5", kind: "function", name: "helper", file: "src/app.ts", start_line: 5, end_line: 7, content_hash: "h-helper" });

    store.saveTestTrace({
      testNodeId: "src/app.test.ts::appTest:1",
      steps: [
        { nodeId: "src/app.test.ts::appTest:1", ordinal: 0, contentHash: "h-test" },
        { nodeId: "src/app.ts::prod:1", ordinal: 1, contentHash: "h-prod" },
      ],
    });

    store.saveTestTrace({
      testNodeId: "src/app.test.ts::appTest:1",
      steps: [
        { nodeId: "src/app.test.ts::appTest:1", ordinal: 0, contentHash: "h-test" },
        { nodeId: "src/app.ts::helper:5", ordinal: 1, contentHash: "h-helper" },
      ],
    });

    expect(store.getTestTrace("src/app.test.ts::appTest:1")).toEqual({
      testNodeId: "src/app.test.ts::appTest:1",
      steps: [
        { nodeId: "src/app.test.ts::appTest:1", ordinal: 0, contentHash: "h-test" },
        { nodeId: "src/app.ts::helper:5", ordinal: 1, contentHash: "h-helper" },
      ],
    });
  } finally {
    store.close();
  }
});

test("clearFile and deleteFile leave coverage edges and test traces to the coverage stage", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/app.test.ts::appTest:1", kind: "test", name: "appTest", file: "src/app.test.ts", start_line: 1, end_line: 3, content_hash: "h-test" });
    store.addNode({ id: "src/app.ts::prod:1", kind: "function", name: "prod", file: "src/app.ts", start_line: 1, end_line: 3, content_hash: "h-prod" });
    store.addEdge({ source: "src/app.ts::prod:1", target: "src/app.test.ts::appTest:1", kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "r", content_hash: "h-prod" }, created_at: 0 });
    store.saveTestTrace({ testNodeId: "src/app.test.ts::appTest:1", steps: [{ nodeId: "src/app.ts::prod:1", ordinal: 1, contentHash: "h-prod" }] });

    store.clearFile("src/app.ts");
    store.deleteFile("src/app.test.ts");

    expect(store.queryRows("SELECT source, target FROM edges")).toEqual([{ source: "src/app.ts::prod:1", target: "src/app.test.ts::appTest:1" }]);
    expect(store.queryRows("SELECT test_node_id, node_id FROM test_trace_steps")).toEqual([{ test_node_id: "src/app.test.ts::appTest:1", node_id: "src/app.ts::prod:1" }]);
  } finally {
    store.close();
  }
});
