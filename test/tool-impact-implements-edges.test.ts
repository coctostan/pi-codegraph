import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { impactResult } from "../src/tools/impact.js";

type ChangeType = Parameters<typeof impactResult>[0]["changeType"];

// No files on disk: rows read `<line>:?` and `[stale]`, which these cases ignore.
const ROW = /^(\S+)  \S+  (\S+)  (breaking|behavioral)  depth:(\d+)/;
function rows(store: SqliteGraphStore, symbol: string, changeType: ChangeType) {
  const { text } = impactResult({ symbols: [symbol], changeType, store, projectRoot: "/nonexistent", maxDepth: 5 });
  return text.split("\n").flatMap((line) => {
    const m = ROW.exec(line);
    return m ? [{ file: m[1], name: m[2], classification: m[3], depth: Number(m[4]) }] : [];
  });
}

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

test("impact follows inbound `implements` edges: interface change reaches implementors and their callers", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/iface.ts::Store:1", kind: "interface", name: "Store", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    addNode(store, { id: "src/impl.ts::MyStore:1", kind: "class", name: "MyStore", file: "src/impl.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    addNode(store, { id: "src/app.ts::useStore:1", kind: "function", name: "useStore", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });

    // MyStore implements Store
    addEdge(store, "src/impl.ts::MyStore:1", "src/iface.ts::Store:1", "implements", 0.9);
    // useStore calls MyStore
    addEdge(store, "src/app.ts::useStore:1", "src/impl.ts::MyStore:1", "calls", 0.7);

    expect(rows(store, "Store", "signature_change")).toEqual([
      { name: "MyStore", file: "src/impl.ts", depth: 1, classification: "breaking" },
      { name: "useStore", file: "src/app.ts", depth: 2, classification: "behavioral" },
    ]);

    const removal = rows(store, "Store", "removal");
    expect(removal.map((row) => row.name)).toEqual(["MyStore", "useStore"]);
    expect(removal.find((row) => row.name === "MyStore")?.classification).toBe("breaking");

    expect(rows(store, "Store", "behavior_change").map((row) => row.classification)).toEqual(["behavioral", "behavioral"]);
  } finally {
    store.close();
  }
});

test("impact deduplicates a node that both `calls` and `implements` a changed seed (AC #074.5)", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/iface.ts::Store:1", kind: "interface", name: "Store", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    // Dual: implements Store AND also calls Store directly (unusual but legal).
    addNode(store, { id: "src/dual.ts::Dual:1", kind: "class", name: "Dual", file: "src/dual.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    addEdge(store, "src/dual.ts::Dual:1", "src/iface.ts::Store:1", "implements", 0.9);
    addEdge(store, "src/dual.ts::Dual:1", "src/iface.ts::Store:1", "calls", 0.6);

    // One breaking row for Dual, at depth 1.
    expect(rows(store, "Store", "signature_change")).toEqual([
      { name: "Dual", file: "src/dual.ts", depth: 1, classification: "breaking" },
    ]);
  } finally {
    store.close();
  }
});
