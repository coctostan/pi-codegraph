import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { collectImpact } from "../src/tools/impact.js";

function addNode(store: SqliteGraphStore, node: GraphNode) {
  store.addNode(node);
}

function addEdge(
  store: SqliteGraphStore,
  source: string,
  target: string,
  kind: "calls" | "implements",
  confidence: number,
) {
  store.addEdge({
    source,
    target,
    kind,
    provenance: {
      source: kind === "implements" ? "lsp" : "tree-sitter",
      confidence,
      evidence: kind,
      content_hash: "h",
    },
    created_at: 1,
  });
}

test("collectImpact follows inbound `implements` edges: interface change reaches implementors and their callers", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/iface.ts::Store:1", kind: "interface", name: "Store", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    addNode(store, { id: "src/impl.ts::MyStore:1", kind: "class", name: "MyStore", file: "src/impl.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    addNode(store, { id: "src/app.ts::useStore:1", kind: "function", name: "useStore", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });

    // MyStore implements Store
    addEdge(store, "src/impl.ts::MyStore:1", "src/iface.ts::Store:1", "implements", 0.9);
    // useStore calls MyStore
    addEdge(store, "src/app.ts::useStore:1", "src/impl.ts::MyStore:1", "calls", 0.7);

    const sig = collectImpact({ symbols: ["Store"], changeType: "signature_change", store, maxDepth: 5 });
    expect(sig).toEqual([
      { nodeId: "src/impl.ts::MyStore:1", name: "MyStore", file: "src/impl.ts", depth: 1, classification: "breaking" },
      { nodeId: "src/app.ts::useStore:1", name: "useStore", file: "src/app.ts", depth: 2, classification: "behavioral" },
    ]);

    const removal = collectImpact({ symbols: ["Store"], changeType: "removal", store, maxDepth: 5 });
    expect(removal.map((h) => h.name)).toEqual(["MyStore", "useStore"]);
    expect(removal.find((h) => h.name === "MyStore")?.classification).toBe("breaking");

    const behavioral = collectImpact({ symbols: ["Store"], changeType: "behavior_change", store, maxDepth: 5 });
    expect(behavioral.map((h) => h.classification)).toEqual(["behavioral", "behavioral"]);
  } finally {
    store.close();
  }
});

test("collectImpact deduplicates a node that both `calls` and `implements` a changed seed (AC #074.5)", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/iface.ts::Store:1", kind: "interface", name: "Store", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    // Dual: implements Store AND also calls Store directly (unusual but legal).
    addNode(store, { id: "src/dual.ts::Dual:1", kind: "class", name: "Dual", file: "src/dual.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    addEdge(store, "src/dual.ts::Dual:1", "src/iface.ts::Store:1", "implements", 0.9);
    addEdge(store, "src/dual.ts::Dual:1", "src/iface.ts::Store:1", "calls", 0.6);

    const hits = collectImpact({ symbols: ["Store"], changeType: "signature_change", store, maxDepth: 5 });
    // No duplicates for Dual.
    expect(hits.filter((h) => h.nodeId === "src/dual.ts::Dual:1")).toHaveLength(1);
    // It must be classified as the breaking dependent at depth 1.
    const dual = hits.find((h) => h.nodeId === "src/dual.ts::Dual:1")!;
    expect(dual.depth).toBe(1);
    expect(dual.classification).toBe("breaking");
  } finally {
    store.close();
  }
});
