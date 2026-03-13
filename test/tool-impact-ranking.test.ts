import { expect, test } from "bun:test";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { collectImpactDetails } from "../src/tools/impact.js";

function addNode(store: SqliteGraphStore, node: GraphNode) {
  store.addNode(node);
}

function addCall(store: SqliteGraphStore, source: string, target: string, confidence: number) {
  store.addEdge({
    source,
    target,
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence,
      evidence: "call",
      content_hash: "hash",
    },
    created_at: 1,
  });
}

test("collectImpactDetails ranks dependents and carries weakest-link chain confidence", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    addNode(store, { id: "src/api.ts::api:1", kind: "function", name: "api", file: "src/api.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    addNode(store, { id: "src/a1.ts::a1:1", kind: "function", name: "a1", file: "src/a1.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });
    addNode(store, { id: "src/a2.ts::a2:1", kind: "function", name: "a2", file: "src/a2.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });
    addNode(store, { id: "src/a3.ts::a3:1", kind: "function", name: "a3", file: "src/a3.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });

    addCall(store, "src/api.ts::api:1", "src/shared.ts::shared:1", 0.8);
    addCall(store, "src/a1.ts::a1:1", "src/api.ts::api:1", 0.2);
    addCall(store, "src/a1.ts::a1:1", "src/api.ts::api:1", 0.9); // duplicate caller edge, keep strongest hop confidence
    addCall(store, "src/a2.ts::a2:1", "src/api.ts::api:1", 0.7);
    addCall(store, "src/a3.ts::a3:1", "src/api.ts::api:1", 0.4);

    const details = collectImpactDetails({
      symbols: ["shared"],
      changeType: "signature_change",
      store,
      maxDepth: 5,
    });

    expect(details.map((item) => item.name)).toEqual(["api", "a1", "a2", "a3"]);

    expect(details.map((item) => ({
      name: item.name,
      depth: item.depth,
      classification: item.classification,
      chainConfidence: item.chainConfidence,
    }))).toEqual([
      { name: "api", depth: 1, classification: "breaking", chainConfidence: 0.8 },
      { name: "a1", depth: 2, classification: "behavioral", chainConfidence: 0.8 },
      { name: "a2", depth: 2, classification: "behavioral", chainConfidence: 0.7 },
      { name: "a3", depth: 2, classification: "behavioral", chainConfidence: 0.4 },
    ]);
  } finally {
    store.close();
  }
});


test("collectImpactDetails prioritizes untested before tested ahead of depth", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    addNode(store, { id: "src/tested.ts::testedCaller:1", kind: "function", name: "testedCaller", file: "src/tested.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });
    addNode(store, { id: "src/mid.ts::mid:1", kind: "function", name: "mid", file: "src/mid.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });
    addNode(store, { id: "src/deep.ts::untestedDeep:1", kind: "function", name: "untestedDeep", file: "src/deep.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });
    addNode(store, { id: "test/tested.spec.ts::tested spec:1", kind: "test", name: "tested spec", file: "test/tested.spec.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });

    addCall(store, "src/tested.ts::testedCaller:1", "src/shared.ts::shared:1", 0.6); // depth 1
    addCall(store, "src/mid.ts::mid:1", "src/shared.ts::shared:1", 0.6); // depth 1
    addCall(store, "src/deep.ts::untestedDeep:1", "src/mid.ts::mid:1", 0.6); // depth 2

    store.addEdge({
      source: "src/tested.ts::testedCaller:1",
      target: "test/tested.spec.ts::tested spec:1",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 1, evidence: "v8", content_hash: "h" },
      created_at: 2,
    });

    const details = collectImpactDetails({
      symbols: ["shared"],
      changeType: "behavior_change",
      store,
      maxDepth: 5,
    });

    expect(details.map((d) => d.name)).toEqual(["mid", "untestedDeep", "testedCaller"]);
  } finally {
    store.close();
  }
});
