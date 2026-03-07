import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { collectImpact } from "../src/tools/impact.js";

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

test("collectImpact classifies direct and transitive dependents by change type", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });

    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");

    const signature = collectImpact({
      symbols: ["shared"],
      changeType: "signature_change",
      store,
      maxDepth: 5,
    });
    expect(signature).toEqual([
      { nodeId: "src/a.ts::a:1", name: "a", file: "src/a.ts", depth: 1, classification: "breaking" },
      { nodeId: "src/b.ts::b:1", name: "b", file: "src/b.ts", depth: 2, classification: "behavioral" },
    ]);

    const removal = collectImpact({
      symbols: ["shared"],
      changeType: "removal",
      store,
      maxDepth: 5,
    });
    expect(removal.map((item) => item.classification)).toEqual(["breaking", "behavioral"]);

    const behavioral = collectImpact({
      symbols: ["shared"],
      changeType: "behavior_change",
      store,
      maxDepth: 5,
    });
    expect(behavioral.map((item) => item.classification)).toEqual(["behavioral", "behavioral"]);
  } finally {
    store.close();
  }
});

test("collectImpact respects maxDepth", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");

    expect(
      collectImpact({ symbols: ["shared"], changeType: "signature_change", store, maxDepth: 1 }),
    ).toEqual([
      { nodeId: "src/a.ts::a:1", name: "a", file: "src/a.ts", depth: 1, classification: "breaking" },
    ]);

    expect(
      collectImpact({ symbols: ["shared"], changeType: "addition", store, maxDepth: 5 }),
    ).toEqual([]);
  } finally {
    store.close();
  }
});

test("collectImpact returns no dependents for addition", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");

    expect(
      collectImpact({ symbols: ["shared"], changeType: "addition", store, maxDepth: 5 }),
    ).toEqual([]);
  } finally {
    store.close();
  }
});

test("collectImpact terminates on cycles without duplicates", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });

    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");
    addCall(store, "src/a.ts::a:1", "src/b.ts::b:1");

    const result = collectImpact({
      symbols: ["shared"],
      changeType: "behavior_change",
      store,
      maxDepth: 5,
    });

    expect(result).toEqual([
      { nodeId: "src/a.ts::a:1", name: "a", file: "src/a.ts", depth: 1, classification: "behavioral" },
      { nodeId: "src/b.ts::b:1", name: "b", file: "src/b.ts", depth: 2, classification: "behavioral" },
    ]);
  } finally {
    store.close();
  }
});

test("collectImpact terminates on a 3-node cycle without duplicates", () => {
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

    const result = collectImpact({ symbols: ["shared"], changeType: "behavior_change", store, maxDepth: 10 });
    expect(result.map((r) => r.nodeId).sort()).toEqual([
      "src/a.ts::a:1",
      "src/b.ts::b:1",
      "src/c.ts::c:1",
    ]);
  } finally {
    store.close();
  }
});

test("collectImpact classification matrix (AC 34) across all change types", () => {
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
      const out = collectImpact({ symbols: ["shared"], changeType: c.changeType, store, maxDepth: 5 });
      expect(out.map((r) => r.classification)).toEqual(c.expected as any);
    }
  } finally {
    store.close();
  }
});
