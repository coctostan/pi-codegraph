import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("deleteFile preserves agent edges while still deleting file nodes and hash", () => {
  const store = new SqliteGraphStore();

  const nodeA = { id: "src/a.ts::foo:1", kind: "function" as const, name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "ha" };
  const nodeB = { id: "src/b.ts::bar:1", kind: "function" as const, name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "hb" };

  store.addNode(nodeA);
  store.addNode(nodeB);
  store.setFileHash("src/a.ts", "fha");

  store.addEdge({
    source: nodeA.id,
    target: nodeB.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: "e1" },
    created_at: 1,
  });

  store.addEdge({
    source: nodeA.id,
    target: nodeB.id,
    kind: "imports",
    provenance: { source: "agent", confidence: 0.7, evidence: "agent resolved", content_hash: "e2" },
    created_at: 2,
  });

  store.deleteFile("src/a.ts");

  // AC12: nodes and file hash removed
  expect(store.getNodesByFile("src/a.ts")).toEqual([]);
  expect(store.getFileHash("src/a.ts")).toBeNull();

  // AC11: agent edge is preserved — re-add the node and verify the agent edge is still there
  store.addNode(nodeA);
  const neighbors = store.getNeighbors(nodeA.id, { direction: "out" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.edge.provenance.source).toBe("agent");
  expect(neighbors[0]!.edge.kind).toBe("imports");

  store.close();
});
