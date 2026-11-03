import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { impactResult } from "../src/tools/impact.js";

type ChangeType = Parameters<typeof impactResult>[0]["changeType"];

// No files on disk: rows read `<line>:?` and `[stale]`, which these cases ignore.
const ROW = /^(\S+)  \S+  (\S+)  (breaking|behavioral)  depth:(\d+)/;
function rows(store: SqliteGraphStore, symbol: string, changeType: ChangeType, maxDepth = 5) {
  const { text } = impactResult({ symbols: [symbol], changeType, store, projectRoot: "/nonexistent", maxDepth });
  return text.split("\n").flatMap((line) => {
    const m = ROW.exec(line);
    return m ? [{ file: m[1], name: m[2], classification: m[3], depth: Number(m[4]) }] : [];
  });
}

function addNode(store: SqliteGraphStore, node: GraphNode) {
  store.addNode(node);
}

function addCall(store: SqliteGraphStore, source: string, target: string) {
  store.addEdge({
    source,
    target,
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: "call",
      content_hash: "hash",
    },
    created_at: 1,
  });
}

test("impact classifies direct and transitive dependents by change type", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });

    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");

    expect(rows(store, "shared", "signature_change")).toEqual([
      { name: "a", file: "src/a.ts", depth: 1, classification: "breaking" },
      { name: "b", file: "src/b.ts", depth: 2, classification: "behavioral" },
    ]);
    expect(rows(store, "shared", "removal").map((row) => row.classification)).toEqual(["breaking", "behavioral"]);
    expect(rows(store, "shared", "behavior_change").map((row) => row.classification)).toEqual(["behavioral", "behavioral"]);
  } finally {
    store.close();
  }
});

test("impact respects maxDepth", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");

    expect(rows(store, "shared", "signature_change", 1)).toEqual([
      { name: "a", file: "src/a.ts", depth: 1, classification: "breaking" },
    ]);
  } finally {
    store.close();
  }
});

test("impact returns no dependents for addition", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");

    expect(rows(store, "shared", "addition")).toEqual([]);
    expect(
      impactResult({ symbols: ["shared"], changeType: "addition", store, projectRoot: "/nonexistent" }).text,
    ).toContain("addition: impact analysis for additions is not yet supported");
  } finally {
    store.close();
  }
});

test("impact terminates on cycles without duplicates", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });

    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");
    addCall(store, "src/a.ts::a:1", "src/b.ts::b:1");

    expect(rows(store, "shared", "behavior_change")).toEqual([
      { name: "a", file: "src/a.ts", depth: 1, classification: "behavioral" },
      { name: "b", file: "src/b.ts", depth: 2, classification: "behavioral" },
    ]);
  } finally {
    store.close();
  }
});

test("impact terminates on a 3-node cycle without duplicates", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/c.ts::c:1", kind: "function", name: "c", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: "h" });

    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");
    addCall(store, "src/c.ts::c:1", "src/b.ts::b:1");
    addCall(store, "src/a.ts::a:1", "src/c.ts::c:1");

    expect(rows(store, "shared", "behavior_change", 10).map((row) => row.name).sort()).toEqual(["a", "b", "c"]);
  } finally {
    store.close();
  }
});

test("impact classification matrix (AC 34) across all change types", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");

    const cases = [
      { changeType: "signature_change", expected: ["breaking"] },
      { changeType: "removal", expected: ["breaking"] },
      { changeType: "behavior_change", expected: ["behavioral"] },
      { changeType: "addition", expected: [] },
    ] as const;

    for (const c of cases) {
      expect(rows(store, "shared", c.changeType).map((row) => row.classification)).toEqual([...c.expected]);
    }
  } finally {
    store.close();
  }
});
