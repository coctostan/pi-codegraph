import { expect, test } from "bun:test";
import { rankNeighbors } from "../src/output/anchoring.js";
import type { NeighborResult } from "../src/graph/store.js";

function makeNeighbor(name: string, confidence: number, createdAt: number = 1000): NeighborResult {
  return {
    node: {
      id: `src/a.ts::${name}:1`,
      kind: "function",
      name,
      file: "src/a.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "h1",
    },
    edge: {
      source: `src/a.ts::${name}:1`,
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "tree-sitter",
        confidence,
        evidence: "direct call",
        content_hash: "eh1",
      },
      created_at: createdAt,
    },
  };
}

test("rankNeighbors sorts by confidence descending and truncates to limit", () => {
  const neighbors: NeighborResult[] = [
    makeNeighbor("low", 0.3),
    makeNeighbor("high", 0.9),
    makeNeighbor("mid1", 0.5),
    makeNeighbor("mid2", 0.5),
    makeNeighbor("top", 1.0),
  ];

  const result = rankNeighbors(neighbors, 3);

  expect(result.kept).toHaveLength(3);
  expect(result.kept[0]!.node.name).toBe("top");
  expect(result.kept[1]!.node.name).toBe("high");
  expect(result.kept[2]!.edge.provenance.confidence).toBe(0.5);
  expect(result.omitted).toBe(2);
});


test("rankNeighbors breaks confidence ties by created_at descending (newer first)", () => {
  const neighbors: NeighborResult[] = [
    makeNeighbor("older", 0.5, 1000),
    makeNeighbor("newer", 0.5, 2000),
    makeNeighbor("newest", 0.5, 3000),
  ];

  const result = rankNeighbors(neighbors, 3);

  expect(result.kept[0]!.node.name).toBe("newest");
  expect(result.kept[1]!.node.name).toBe("newer");
  expect(result.kept[2]!.node.name).toBe("older");
  expect(result.omitted).toBe(0);
});


test("rankNeighbors returns all items with omitted=0 when within limit", () => {
  const neighbors: NeighborResult[] = [
    makeNeighbor("a", 0.8),
    makeNeighbor("b", 0.6),
  ];

  const result = rankNeighbors(neighbors, 10);

  expect(result.kept).toHaveLength(2);
  expect(result.kept[0]!.node.name).toBe("a");
  expect(result.kept[1]!.node.name).toBe("b");
  expect(result.omitted).toBe(0);
});
