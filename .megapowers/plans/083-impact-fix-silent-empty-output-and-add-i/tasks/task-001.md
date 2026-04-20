---
id: 1
title: "Traverse inbound `implements` edges in `collectImpactDetails` (fixes #074)"
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/impact.ts
files_to_create:
  - test/tool-impact-implements-edges.test.ts
---

Extend `collectImpactDetails` in `src/tools/impact.ts` so that inbound `implements` edges count as dependency evidence, producing the same breaking/behavioral classification the existing calls traversal does. This fixes all acceptance criteria of #074 and Fixed-When #1 / #2 / #7 of the diagnosis.

**Files:**
- Create: `test/tool-impact-implements-edges.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Current signatures, copied from source:

- `src/tools/impact.ts:66` — `export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[]`
- `src/tools/impact.ts:121` — `export function collectImpact(params: CollectImpactParams): ImpactItem[]`
- `src/graph/store.ts:3-6` — `NeighborOptions { kind?: EdgeKind; direction?: "in"|"out"|"both" }`

Create `test/tool-impact-implements-edges.test.ts`:

```ts
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
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-implements-edges.test.ts`

Expected: FAIL — the first test fails with:

```
error: expect(received).toEqual(expected)
...
Received: []
```

(because `collectImpactDetails` hard-codes `kind: "calls"` at `src/tools/impact.ts:89` and never reads `implements` edges; output is an empty array.)

**Step 3 — Write minimal implementation**

Edit `src/tools/impact.ts`. Replace the single-kind neighbor fetch at line 89 inside `collectImpactDetails` with a merge of inbound `calls` and inbound `implements`. The existing `dedupeInboundByStrongestEdge` already collapses duplicates by `neighbor.node.id`, so concatenating the two lists handles the AC-5 dedup requirement without new code.

Find the block starting at line 85 (`while (queue.length > 0) {`) and change only the inbound fetch line. Target post-change body:

```ts
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inboundCalls = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
    const inboundImplements = store.getNeighbors(current.id, { direction: "in", kind: "implements" });
    const inbound = dedupeInboundByStrongestEdge([...inboundCalls, ...inboundImplements]);

    for (const neighbor of inbound) {
      // ...existing body unchanged...
    }
  }
```

No other changes. Do not modify `classify`, `dedupeInboundByStrongestEdge`, or the queue/seen logic — implementors correctly classify as `breaking` at depth 1 because `classify("signature_change" | "removal", 1) === "breaking"` and depth-1 `implements` edges flow through the same `classification` assignment. Confidence carries via `neighbor.edge.provenance.confidence` (the `implements` edge's LSP confidence).

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-implements-edges.test.ts`

Expected: PASS — both test cases.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. Pay particular attention to `test/tool-impact.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-performance.test.ts`, `test/extension-impact.test.ts`. These use function-seeds with no inbound `implements` edges, so the added query returns `[]` and the merged list equals the previous calls-only list — behavior is unchanged for them.
