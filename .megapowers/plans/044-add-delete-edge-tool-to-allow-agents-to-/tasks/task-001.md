---
id: 1
title: deleteEdge core function — successful deletion of agent edge
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/delete-edge.ts
  - test/tool-delete-edge.test.ts
---

Covers: AC 7 (calls store.deleteEdge with "agent"), AC 8 (returns confirmation with anchors), AC 10 (lives in delete-edge.ts as pure function)

**Files:**
- Create: `src/tools/delete-edge.ts`
- Create: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-delete-edge.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deleteEdge } from "../src/tools/delete-edge.js";

test("deleteEdge deletes an existing agent edge and returns confirmation", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  // Create an agent edge first
  store.addEdge({
    source: "src/a.ts::foo:1",
    target: "src/b.ts::bar:1",
    kind: "calls",
    provenance: { source: "agent", confidence: 0.7, evidence: "test evidence", content_hash: "h1" },
    created_at: Date.now(),
  });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Edge deleted:");
  expect(result).toContain("source:");
  expect(result).toContain("target:");
  expect(result).toContain("kind: calls");

  // Verify edge is actually gone
  const neighbors = store.getNeighbors("src/a.ts::foo:1", { direction: "out", kind: "calls" });
  expect(neighbors).toHaveLength(0);

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: FAIL — `error: Cannot find module "../src/tools/delete-edge.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/tools/delete-edge.ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode, EdgeKind } from "../graph/types.js";
import { computeAnchor } from "../output/anchoring.js";

const VALID_EDGE_KINDS: EdgeKind[] = [
  "calls",
  "imports",
  "implements",
  "extends",
  "tested_by",
  "co_changes_with",
  "renders",
  "routes_to",
];

function isValidEdgeKind(kind: string): kind is EdgeKind {
  return VALID_EDGE_KINDS.includes(kind as EdgeKind);
}

function formatDisambiguation(label: string, nodes: GraphNode[]): string {
  const lines: string[] = [`Ambiguous ${label} — multiple matches:`];
  for (const node of nodes) {
    lines.push(`  ${node.file}  ${node.kind}  line ${node.start_line}`);
  }
  lines.push(`\nSpecify ${label}File to disambiguate.`);
  return lines.join("\n");
}

export interface DeleteEdgeParams {
  source: string;
  target: string;
  sourceFile?: string;
  targetFile?: string;
  kind: string;
  store: GraphStore;
  projectRoot: string;
}

export function deleteEdge(params: DeleteEdgeParams): string {
  const { source, target, sourceFile, targetFile, kind, store, projectRoot } = params;

  // Look up source node
  const sourceNodes = store.findNodes(source, sourceFile);
  if (sourceNodes.length === 0) {
    return `Source symbol "${source}" not found`;
  }
  if (sourceNodes.length > 1) {
    return formatDisambiguation("source", sourceNodes);
  }

  // Look up target node
  const targetNodes = store.findNodes(target, targetFile);
  if (targetNodes.length === 0) {
    return `Target symbol "${target}" not found`;
  }
  if (targetNodes.length > 1) {
    return formatDisambiguation("target", targetNodes);
  }

  // Validate edge kind
  if (!isValidEdgeKind(kind)) {
    return `Invalid edge kind "${kind}". Valid kinds: ${VALID_EDGE_KINDS.join(", ")}`;
  }

  const sourceNode = sourceNodes[0]!;
  const targetNode = targetNodes[0]!;

  // Check for existing agent edge
  const existingNeighbors = store.getNeighbors(sourceNode.id, { direction: "out", kind });
  const agentEdge = existingNeighbors.find(
    (nr) => nr.edge.target === targetNode.id && nr.edge.provenance.source === "agent"
  );

  if (!agentEdge) {
    return `No agent edge found: ${sourceNode.name} -[${kind}]→ ${targetNode.name}`;
  }

  store.deleteEdge(sourceNode.id, targetNode.id, kind, "agent");

  const sourceAnchor = computeAnchor(sourceNode, projectRoot);
  const targetAnchor = computeAnchor(targetNode, projectRoot);

  return [
    "Edge deleted:",
    `  source: ${sourceAnchor.anchor}  ${sourceNode.name}`,
    `  target: ${targetAnchor.anchor}  ${targetNode.name}`,
    `  kind: ${kind}`,
  ].join("\n");
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
