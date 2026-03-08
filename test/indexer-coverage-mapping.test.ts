import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { mapCoverageToNodes, type NormalizedCoverageRecord } from "../src/indexer/coverage.js";

test("mapCoverageToNodes resolves same-file overlapping nodes and prefers the smallest span", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/app.ts::outer:1", kind: "function", name: "outer", file: "src/app.ts", start_line: 1, end_line: 10, content_hash: "h-app" });
    store.addNode({ id: "src/app.ts::inner:3", kind: "function", name: "inner", file: "src/app.ts", start_line: 3, end_line: 5, content_hash: "h-app" });
    store.addNode({ id: "src/app.test.ts::appTest:1", kind: "test", name: "appTest", file: "src/app.test.ts", start_line: 1, end_line: 3, content_hash: "h-test" });

    const records: NormalizedCoverageRecord[] = [
      { reportFile: "report.json", file: "src/app.test.ts", functionName: "appTest", startOffset: 0, endOffset: 10, startLine: 1, endLine: 3, count: 1 },
      { reportFile: "report.json", file: "src/app.ts", functionName: "inner", startOffset: 20, endOffset: 40, startLine: 3, endLine: 5, count: 1 },
      { reportFile: "report.json", file: "src/missing.ts", functionName: "ghost", startOffset: 0, endOffset: 1, startLine: 1, endLine: 1, count: 1 },
    ];

    const mapped = mapCoverageToNodes(store, records);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({ file: "src/app.test.ts", node: { id: "src/app.test.ts::appTest:1", kind: "test" } });
    expect(mapped[1]).toMatchObject({ file: "src/app.ts", node: { id: "src/app.ts::inner:3", kind: "function" } });
    expect(mapped.some((item) => item.node.id === "src/app.ts::outer:1")).toBe(false);
  } finally {
    store.close();
  }
});
