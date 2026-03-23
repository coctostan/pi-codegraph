import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { resolveEdge } from "../src/tools/resolve-edge.js";

test("resolveEdge rejects self-referential edge (source === target)", () => {
  const store = new SqliteGraphStore();
  const projectRoot = "/tmp/test-project";

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "abc123",
    is_exported: false,
  });

  const result = resolveEdge({
    source: "foo",
    target: "foo",
    kind: "calls",
    evidence: "foo calls itself recursively",
    store,
    projectRoot,
  });

  // Should reject, not create
  expect(result).not.toContain("Edge created");
  expect(result).not.toContain("Edge updated");
  expect(result).toContain("same node");
});

test("resolveEdge allows edge between different nodes with same name in different files", () => {
  const store = new SqliteGraphStore();
  const projectRoot = "/tmp/test-project";

  store.addNode({
    id: "src/a.ts::init:1",
    kind: "function",
    name: "init",
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "abc123",
    is_exported: false,
  });
  store.addNode({
    id: "src/b.ts::init:1",
    kind: "function",
    name: "init",
    file: "src/b.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "def456",
    is_exported: false,
  });

  const result = resolveEdge({
    source: "init",
    target: "init",
    sourceFile: "src/a.ts",
    targetFile: "src/b.ts",
    kind: "calls",
    evidence: "a/init calls b/init",
    store,
    projectRoot,
  });

  // Different nodes — should succeed
  expect(result).toContain("Edge created");
});
