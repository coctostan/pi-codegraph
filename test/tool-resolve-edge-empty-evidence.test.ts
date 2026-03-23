import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { resolveEdge } from "../src/tools/resolve-edge.js";

function makeStore() {
  const store = new SqliteGraphStore();
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
  store.addNode({
    id: "src/a.ts::bar:10",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 15,
    content_hash: "def456",
    is_exported: false,
  });
  return store;
}

test("resolveEdge rejects empty evidence string", () => {
  const store = makeStore();

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "",
    store,
    projectRoot: "/tmp/test-project",
  });

  expect(result).not.toContain("Edge created");
  expect(result).not.toContain("Edge updated");
  expect(result).toContain("evidence");
});

test("resolveEdge rejects whitespace-only evidence", () => {
  const store = makeStore();

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "   \t\n  ",
    store,
    projectRoot: "/tmp/test-project",
  });

  expect(result).not.toContain("Edge created");
  expect(result).not.toContain("Edge updated");
  expect(result).toContain("evidence");
});

test("resolveEdge accepts non-empty evidence", () => {
  const store = makeStore();

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "foo calls bar in the handler",
    store,
    projectRoot: "/tmp/test-project",
  });

  expect(result).toContain("Edge created");
});
