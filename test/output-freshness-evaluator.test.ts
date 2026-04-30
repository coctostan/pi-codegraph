import { expect, test } from "bun:test";
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphEdge, GraphNode } from "../src/graph/types.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { evaluateFreshness, formatFreshnessHeader } from "../src/output/freshness.js";

interface Fixture {
  projectRoot: string;
  store: SqliteGraphStore;
  target: GraphNode;
  neighbor: GraphNode;
  edge: GraphEdge;
  targetV1: string;
  neighborV1: string;
}

function createFixture(): Fixture {
  const projectRoot = join(tmpdir(), `pi-cg-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const targetV1 = "export function target() { return 1; }\n";
  const neighborV1 = "export function neighbor() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "target.ts"), targetV1);
  writeFileSync(join(projectRoot, "src", "neighbor.ts"), neighborV1);

  const targetHash = sha256Hex(targetV1);
  const neighborHash = sha256Hex(neighborV1);
  const store = new SqliteGraphStore();

  const target: GraphNode = {
    id: "src/target.ts::target:1",
    kind: "function",
    name: "target",
    file: "src/target.ts",
    start_line: 1,
    end_line: 1,
    content_hash: targetHash,
    is_exported: true,
  };
  const neighbor: GraphNode = {
    id: "src/neighbor.ts::neighbor:1",
    kind: "function",
    name: "neighbor",
    file: "src/neighbor.ts",
    start_line: 1,
    end_line: 1,
    content_hash: neighborHash,
    is_exported: true,
  };
  const edge: GraphEdge = {
    source: target.id,
    target: neighbor.id,
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.8,
      evidence: "target calls neighbor",
      content_hash: targetHash,
    },
    created_at: 1,
  };

  store.addNode(target);
  store.addNode(neighbor);
  store.addEdge(edge);
  store.setFileHash("src/target.ts", targetHash);
  store.setFileHash("src/neighbor.ts", neighborHash);

  return { projectRoot, store, target, neighbor, edge, targetV1, neighborV1 };
}

function cleanup(fixture: Fixture): void {
  fixture.store.close();
  rmSync(fixture.projectRoot, { recursive: true, force: true });
}

test("evaluateFreshness returns Trust: fresh for fresh scoped target nodes", () => {
  const fixture = createFixture();
  try {
    const fresh = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target],
      resultEdges: [],
    });
    expect(fresh.status).toBe("fresh");
    expect(formatFreshnessHeader(fresh)).toBe("Trust: fresh");
  } finally {
    cleanup(fixture);
  }
});

test("evaluateFreshness returns stale when the requested target node changed", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.projectRoot, "src", "target.ts"), "export function target() { return 2; }\n");
    const staleTarget = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target],
      resultEdges: [],
    });
    expect(staleTarget.status).toBe("stale");
    expect(staleTarget.changedFiles.map((f) => f.file)).toEqual(["src/target.ts"]);
    expect(staleTarget.affectedSymbols).toEqual(["target"]);
    expect(formatFreshnessHeader(staleTarget)).toContain("src/target.ts (indexed_at:");
  } finally {
    cleanup(fixture);
  }
});

test("evaluateFreshness returns partial when only a returned neighbor node changed", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.projectRoot, "src", "neighbor.ts"), "export function neighbor() { return 2; }\n");
    const staleNeighbor = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target, fixture.neighbor],
      resultEdges: [],
    });
    expect(staleNeighbor.status).toBe("partial");
    expect(staleNeighbor.changedFiles.map((f) => f.file)).toEqual(["src/neighbor.ts"]);
    expect(staleNeighbor.affectedSymbols).toEqual(["neighbor"]);
  } finally {
    cleanup(fixture);
  }
});

test("evaluateFreshness counts stale edge provenance against the source evidence file", () => {
  const fixture = createFixture();
  try {
    const staleEdge = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target, fixture.neighbor],
      resultEdges: [{ ...fixture.edge, provenance: { ...fixture.edge.provenance, content_hash: "old-hash" } }],
    });
    expect(staleEdge.status).toBe("partial");
    expect(staleEdge.changedFiles.map((f) => f.file)).toEqual(["src/target.ts"]);
    expect(staleEdge.affectedSymbols).toEqual(["neighbor", "target"]);
    expect(staleEdge.staleEdgeCount).toBe(1);
    expect(formatFreshnessHeader(staleEdge)).toContain("stale edges: 1");
  } finally {
    cleanup(fixture);
  }
});

test("evaluateFreshness reports deleted returned files deterministically", () => {
  const fixture = createFixture();
  try {
    unlinkSync(join(fixture.projectRoot, "src", "neighbor.ts"));
    const deleted = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target, fixture.neighbor],
      resultEdges: [],
    });
    expect(deleted.status).toBe("partial");
    expect(deleted.deletedFiles.map((f) => f.file)).toEqual(["src/neighbor.ts"]);
    expect(deleted.affectedSymbols).toEqual(["neighbor"]);
    const header = formatFreshnessHeader(deleted);
    expect(header).toContain("deleted files: src/neighbor.ts (indexed_at:");
    expect(header).not.toMatch(/ago|today|yesterday|just now/i);
  } finally {
    cleanup(fixture);
  }
});
