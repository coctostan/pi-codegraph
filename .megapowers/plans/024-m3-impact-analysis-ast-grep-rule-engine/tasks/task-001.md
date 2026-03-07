---
id: 1
title: Add pure impact traversal and classification
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/impact.ts
  - test/tool-impact.test.ts
---

### Task 1: Add pure impact traversal and classification

Note: Task 1 is the pure impact traversal/classification foundation used by Task 2 tool output formatting.
**Files:**
- Create: `src/tools/impact.ts`
- Test: `test/tool-impact.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
// GraphNode in this repository includes `content_hash` (used throughout store + edge provenance).
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
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-impact.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/impact.js' from 'test/tool-impact.test.ts'`

**Step 3 — Write minimal implementation**
```ts
import type { GraphStore } from "../graph/store.js";

interface GraphStoreSubset {
  findNodes(name: string, file?: string): Array<{ id: string }>;
  getNeighbors(nodeId: string, options: { direction: "in"; kind: "calls" }): Array<{ node: { id: string; name: string; file: string } }>;
}
// The actual GraphStore from src/graph/store.ts includes these APIs.
// GraphStore API (src/graph/store.ts): findNodes(name: string, file?: string), getNeighbors(nodeId, options).

export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";

export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
}

export interface ImpactItem {
  nodeId: string;
  name: string;
  file: string;
  depth: number;
  classification: ImpactClassification;
}

function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
  if (changeType === "addition") return null;
  if (changeType === "behavior_change") return "behavioral";
  if (changeType === "signature_change" || changeType === "removal") {
    return depth === 1 ? "breaking" : "behavioral";
  }
  return null;
}

export function collectImpact(params: CollectImpactParams): ImpactItem[] {
  const { symbols, changeType, store, maxDepth = 5 } = params;
  if (changeType === "addition") return [];

  const queue: Array<{ id: string; depth: number }> = [];
  const seen = new Set<string>();
  const results: ImpactItem[] = [];

  for (const symbol of symbols) {
    // findNodes(name) may return multiple files for the same symbol name; we intentionally traverse from all matches.
    for (const node of store.findNodes(symbol)) {
      queue.push({ id: node.id, depth: 0 });
      seen.add(node.id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inbound = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
    for (const neighbor of inbound) {
      if (seen.has(neighbor.node.id)) continue;
      const depth = current.depth + 1;
      seen.add(neighbor.node.id);
      queue.push({ id: neighbor.node.id, depth });
      const classification = classify(changeType, depth);
      if (!classification) continue;
      results.push({
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
      });
    }
  }

  return results.sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-impact.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
```
