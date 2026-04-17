import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function setupFixture(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-selfref-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src/a.ts"),
    "export class Foo {\n  doStuff() { this.doStuff(); }\n}\n",
  );
  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

test("self-referential edge should not produce duplicate caller entries", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileContent = "export class Foo {\n  doStuff() { this.doStuff(); }\n}\n";
    const hash = sha256Hex(fileContent);

    // Add a single node
    store.addNode({
      id: "src/a.ts::Foo:1",
      kind: "class",
      name: "Foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 3,
      content_hash: hash,
    });

    // Add a self-referential "calls" edge (source === target)
    store.addEdge({
      source: "src/a.ts::Foo:1",
      target: "src/a.ts::Foo:1",
      kind: "calls",
      provenance: {
        source: "agent",
        confidence: 0.7,
        evidence: "self-call",
        content_hash: hash,
      },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "Foo", include: ["neighborhood"] as any, store, projectRoot });

    // Count how many times the self-referential entry appears in the output.
    // The node line format includes file:line:hash and the node name.
    // For a self-edge, the node "Foo" should appear at most once in a neighbor
    // section (Callers or Callees), not duplicated.
    const lines = output.split("\n");
    const callerLines = lines.filter(
      (line) => line.includes("Foo") && line.includes("calls") && line.includes("src/a.ts:1:"),
    );

    // A self-referential edge should produce at most 1 caller line
    expect(callerLines.length).toBeLessThanOrEqual(1);

    store.close();
  } finally {
    cleanup();
  }
});

test("getNeighbors returns duplicate rows for self-referential edges with direction=both", () => {
  const store = new SqliteGraphStore();

  const nodeId = "src/x.ts::Widget:1";
  store.addNode({
    id: nodeId,
    kind: "class",
    name: "Widget",
    file: "src/x.ts",
    start_line: 1,
    end_line: 10,
    content_hash: "abc123",
  });

  // Self-referential edge
  store.addEdge({
    source: nodeId,
    target: nodeId,
    kind: "calls",
    provenance: {
      source: "agent",
      confidence: 0.7,
      evidence: "recursive call",
      content_hash: "abc123",
    },
    created_at: Date.now(),
  });

  // With direction "both" (default), a self-referential edge should not be duplicated
  const neighbors = store.getNeighbors(nodeId);

    // A self-referential edge should not be duplicated in direction=both
  expect(neighbors.length).toBe(1);

  store.close();
});
