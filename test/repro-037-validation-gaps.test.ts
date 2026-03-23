import { expect, test, describe } from "bun:test";
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
      end_line: 5,
      content_hash: "abc123",
      is_exported: false,
    },
    edge: {
      source: "src/a.ts::caller:1",
      target: `src/a.ts::${name}:1`,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence, evidence: "test", content_hash: "abc123" },
      created_at: createdAt,
    },
  };
}

describe("rankNeighbors negative limit guard", () => {
  test("limit=-1 is treated as default (10), returns all when count < 10", () => {
    const neighbors = [
      makeNeighbor("a", 0.9),
      makeNeighbor("b", 0.8),
      makeNeighbor("c", 0.7),
      makeNeighbor("d", 0.6),
      makeNeighbor("e", 0.5),
    ];

    const result = rankNeighbors(neighbors, -1);
    // 5 items < default 10, so all should be kept
    expect(result.kept.length).toBe(5);
    expect(result.omitted).toBe(0);
  });

  test("limit=-100 is treated as default (10)", () => {
    const neighbors = Array.from({ length: 15 }, (_, i) =>
      makeNeighbor(`fn${i}`, 0.9 - i * 0.01)
    );

    const result = rankNeighbors(neighbors, -100);
    // Default is 10, so 10 kept, 5 omitted
    expect(result.kept.length).toBe(10);
    expect(result.omitted).toBe(5);
  });

  test("limit=0 still returns none (existing behavior preserved)", () => {
    const neighbors = [makeNeighbor("a", 0.9)];
    const result = rankNeighbors(neighbors, 0);
    expect(result.kept.length).toBe(0);
    expect(result.omitted).toBe(1);
  });
});
