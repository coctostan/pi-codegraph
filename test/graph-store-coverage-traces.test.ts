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
