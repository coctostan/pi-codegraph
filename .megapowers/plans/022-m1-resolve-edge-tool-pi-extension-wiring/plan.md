# Plan

### Task 1: resolveEdge returns error when source symbol not found

### Task 1: resolveEdge returns error when source symbol not found

**Files:**
- Test: `test/tool-resolve-edge.test.ts`
- Modify: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-resolve-edge.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { resolveEdge } from "../src/tools/resolve-edge.js";

test("resolveEdge returns error when source symbol not found", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::bar:1",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });

  const result = resolveEdge({
    source: "nonexistent",
    target: "bar",
    kind: "calls",
    evidence: "test evidence",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("not found");
  expect(result).toContain("nonexistent");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: FAIL — `expect(received).toContain(expected) (received is undefined)`

**Step 3 — Write minimal implementation**

```typescript
// src/tools/resolve-edge.ts
import type { GraphStore } from "../graph/store.js";
import type { EdgeKind } from "../graph/types.js";

export interface ResolveEdgeParams {
  source: string;
  target: string;
  sourceFile?: string;
  targetFile?: string;
  kind: string;
  evidence: string;
  store: GraphStore;
  projectRoot: string;
}

export function resolveEdge(params: ResolveEdgeParams): string {
  const { source, target, sourceFile, targetFile, kind, evidence, store, projectRoot } = params;

  // Look up source node
  const sourceNodes = store.findNodes(source, sourceFile);
  if (sourceNodes.length === 0) {
    return `Source symbol "${source}" not found`;
  }

  return "not implemented";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: resolveEdge returns error when target symbol not found [depends: 1]

### Task 2: resolveEdge returns error when target symbol not found [depends: 1]

**Files:**
- Test: `test/tool-resolve-edge.test.ts`
- Modify: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**

```typescript
// Append to test/tool-resolve-edge.test.ts
test("resolveEdge returns error when target symbol not found", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });

  const result = resolveEdge({
    source: "foo",
    target: "nonexistent",
    kind: "calls",
    evidence: "test evidence",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("not found");
  expect(result).toContain("nonexistent");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` — because current implementation returns `"not implemented"` after finding source successfully

**Step 3 — Write minimal implementation**

Update `src/tools/resolve-edge.ts` — add target lookup after the source lookup:

```typescript
// src/tools/resolve-edge.ts
import type { GraphStore } from "../graph/store.js";
import type { EdgeKind } from "../graph/types.js";

export interface ResolveEdgeParams {
  source: string;
  target: string;
  sourceFile?: string;
  targetFile?: string;
  kind: string;
  evidence: string;
  store: GraphStore;
  projectRoot: string;
}

export function resolveEdge(params: ResolveEdgeParams): string {
  const { source, target, sourceFile, targetFile, kind, evidence, store, projectRoot } = params;

  // Look up source node
  const sourceNodes = store.findNodes(source, sourceFile);
  if (sourceNodes.length === 0) {
    return `Source symbol "${source}" not found`;
  }

  // Look up target node
  const targetNodes = store.findNodes(target, targetFile);
  if (targetNodes.length === 0) {
    return `Target symbol "${target}" not found`;
  }

  return "not implemented";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: resolveEdge returns disambiguation list when source has multiple matches [depends: 1]

### Task 3: resolveEdge returns disambiguation list when source has multiple matches [depends: 1]

**Files:**
- Test: `test/tool-resolve-edge.test.ts`
- Modify: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**

```typescript
// Append to test/tool-resolve-edge.test.ts
test("resolveEdge returns disambiguation list when source has multiple matches", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/b.ts::foo:5",
    kind: "class",
    name: "foo",
    file: "src/b.ts",
    start_line: 5,
    end_line: 10,
    content_hash: "h2",
  });
  store.addNode({
    id: "src/a.ts::bar:10",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    content_hash: "h1",
  });

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "test",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Ambiguous source");
  expect(result).toContain("src/a.ts");
  expect(result).toContain("function");
  expect(result).toContain("src/b.ts");
  expect(result).toContain("class");
  expect(result).toContain("line 1");
  expect(result).toContain("line 5");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` — current code returns `"not implemented"` when source has multiple matches (it doesn't check `sourceNodes.length > 1`)

**Step 3 — Write minimal implementation**

Update `src/tools/resolve-edge.ts` to add disambiguation check after the source lookup:

```typescript
// src/tools/resolve-edge.ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode, EdgeKind } from "../graph/types.js";

export interface ResolveEdgeParams {
  source: string;
  target: string;
  sourceFile?: string;
  targetFile?: string;
  kind: string;
  evidence: string;
  store: GraphStore;
  projectRoot: string;
}

function formatDisambiguation(label: string, nodes: GraphNode[]): string {
  const lines: string[] = [`Ambiguous ${label} — multiple matches:`];
  for (const node of nodes) {
    lines.push(`  ${node.file}  ${node.kind}  line ${node.start_line}`);
  }
  lines.push(`\nSpecify ${label}File to disambiguate.`);
  return lines.join("\n");
}

export function resolveEdge(params: ResolveEdgeParams): string {
  const { source, target, sourceFile, targetFile, kind, evidence, store, projectRoot } = params;

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

  return "not implemented";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: resolveEdge returns disambiguation list when target has multiple matches [depends: 3]

### Task 4: resolveEdge returns disambiguation list when target has multiple matches [depends: 3]

**Files:**
- Test: `test/tool-resolve-edge.test.ts`
- Modify: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**

```typescript
// Append to test/tool-resolve-edge.test.ts
test("resolveEdge returns disambiguation list when target has multiple matches", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/a.ts::bar:5",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/b.ts::bar:1",
    kind: "class",
    name: "bar",
    file: "src/b.ts",
    start_line: 1,
    end_line: 10,
    content_hash: "h2",
  });

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "test",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Ambiguous target");
  expect(result).toContain("src/a.ts");
  expect(result).toContain("src/b.ts");
  expect(result).toContain("function");
  expect(result).toContain("class");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` — current code returns `"not implemented"` when target has multiple matches (it doesn't check `targetNodes.length > 1`)

**Step 3 — Write minimal implementation**

Update `src/tools/resolve-edge.ts` — add target disambiguation check:

```typescript
export function resolveEdge(params: ResolveEdgeParams): string {
  const { source, target, sourceFile, targetFile, kind, evidence, store, projectRoot } = params;

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

  return "not implemented";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: resolveEdge rejects invalid edge kinds [depends: 2]

### Task 5: resolveEdge rejects invalid edge kinds [depends: 2]

**Files:**
- Test: `test/tool-resolve-edge.test.ts`
- Modify: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**

```typescript
// Append to test/tool-resolve-edge.test.ts
test("resolveEdge rejects invalid edge kinds", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/a.ts::bar:5",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h1",
  });

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "invalid_kind",
    evidence: "test",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Invalid edge kind");
  expect(result).toContain("invalid_kind");
  expect(result).toContain("calls");
  expect(result).toContain("imports");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` — current code returns `"not implemented"` instead of validating edge kind

**Step 3 — Write minimal implementation**

Update `src/tools/resolve-edge.ts` to add edge kind validation:

```typescript
// src/tools/resolve-edge.ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode, EdgeKind } from "../graph/types.js";

export interface ResolveEdgeParams {
  source: string;
  target: string;
  sourceFile?: string;
  targetFile?: string;
  kind: string;
  evidence: string;
  store: GraphStore;
  projectRoot: string;
}

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

function formatDisambiguation(label: string, nodes: GraphNode[]): string {
  const lines: string[] = [`Ambiguous ${label} — multiple matches:`];
  for (const node of nodes) {
    lines.push(`  ${node.file}  ${node.kind}  line ${node.start_line}`);
  }
  lines.push(`\nSpecify ${label}File to disambiguate.`);
  return lines.join("\n");
}

function isValidEdgeKind(kind: string): kind is EdgeKind {
  return VALID_EDGE_KINDS.includes(kind as EdgeKind);
}

export function resolveEdge(params: ResolveEdgeParams): string {
  const { source, target, sourceFile, targetFile, kind, evidence, store, projectRoot } = params;

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

  return "not implemented";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: resolveEdge creates edge with agent provenance and confirmation [depends: 5]

### Task 6: resolveEdge creates edge with agent provenance and confirmation [depends: 5]

Covers AC 7, AC 8, and AC 10 (created confirmation path).

**Files:**
- Test: `test/tool-resolve-edge.test.ts`
- Modify: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**
```typescript
// Append to test/tool-resolve-edge.test.ts
test("resolveEdge creates edge with agent provenance and returns created confirmation", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });
  store.setFileHash("src/a.ts", "filehash_a");

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    sourceFile: "src/a.ts",
    targetFile: "src/b.ts",
    kind: "calls",
    evidence: "foo calls bar in the handler",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Edge created:");
  expect(result).toContain("source:");
  expect(result).toContain("target:");
  expect(result).toContain("kind: calls");

  const neighbors = store.getNeighbors("src/a.ts::foo:1", { direction: "out", kind: "calls" });
  expect(neighbors).toHaveLength(1);
  const edge = neighbors[0]!.edge;
  expect(edge.provenance.source).toBe("agent");
  expect(edge.provenance.confidence).toBe(0.7);
  expect(edge.provenance.evidence).toBe("foo calls bar in the handler");
  expect(edge.provenance.content_hash).toBe("filehash_a");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because current implementation returns `"not implemented"`

**Step 3 — Write minimal implementation**
```typescript
// src/tools/resolve-edge.ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode, EdgeKind } from "../graph/types.js";
import { computeAnchor } from "../output/anchoring.js";

export interface ResolveEdgeParams {
  source: string;
  target: string;
  sourceFile?: string;
  targetFile?: string;
  kind: string;
  evidence: string;
  store: GraphStore;
  projectRoot: string;
}

const VALID_EDGE_KINDS: EdgeKind[] = ["calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to"];

function formatDisambiguation(label: string, nodes: GraphNode[]): string {
  const lines: string[] = [`Ambiguous ${label} — multiple matches:`];
  for (const node of nodes) lines.push(`  ${node.file}  ${node.kind}  line ${node.start_line}`);
  lines.push(`\nSpecify ${label}File to disambiguate.`);
  return lines.join("\n");
}

function isValidEdgeKind(kind: string): kind is EdgeKind {
  return VALID_EDGE_KINDS.includes(kind as EdgeKind);
}

export function resolveEdge(params: ResolveEdgeParams): string {
  const { source, target, sourceFile, targetFile, kind, evidence, store, projectRoot } = params;

  const sourceNodes = store.findNodes(source, sourceFile);
  if (sourceNodes.length === 0) return `Source symbol "${source}" not found`;
  if (sourceNodes.length > 1) return formatDisambiguation("source", sourceNodes);

  const targetNodes = store.findNodes(target, targetFile);
  if (targetNodes.length === 0) return `Target symbol "${target}" not found`;
  if (targetNodes.length > 1) return formatDisambiguation("target", targetNodes);

  if (!isValidEdgeKind(kind)) {
    return `Invalid edge kind "${kind}". Valid kinds: ${VALID_EDGE_KINDS.join(", ")}`;
  }

  const sourceNode = sourceNodes[0]!;
  const targetNode = targetNodes[0]!;
  const contentHash = store.getFileHash(sourceNode.file) ?? sourceNode.content_hash;

  store.addEdge({
    source: sourceNode.id,
    target: targetNode.id,
    kind,
    provenance: { source: "agent", confidence: 0.7, evidence, content_hash: contentHash },
    created_at: Date.now(),
  });

  const sourceAnchor = computeAnchor(sourceNode, projectRoot);
  const targetAnchor = computeAnchor(targetNode, projectRoot);

  return [
    "Edge created:",
    `  source: ${sourceAnchor.anchor}  ${sourceNode.name}`,
    `  target: ${targetAnchor.anchor}  ${targetNode.name}`,
    `  kind: ${kind}`,
    "  provenance: agent  confidence:0.7",
  ].join("\n");
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: resolveEdge upserts same source→target→kind agent edge [depends: 6]

### Task 7: resolveEdge upserts same source→target→kind agent edge [depends: 6]

Covers AC 9.

**Files:**
- Test: `test/tool-resolve-edge.test.ts`
- Modify: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**
```typescript
// Append to test/tool-resolve-edge.test.ts
test("resolveEdge upserts same source→target→kind agent edge", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  store.setFileHash("src/a.ts", "hash_v1");
  const result1 = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "first evidence",
    store,
    projectRoot: "/tmp/test",
  });
  expect(result1).toContain("created");

  store.setFileHash("src/a.ts", "hash_v2");
  const result2 = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "updated evidence",
    store,
    projectRoot: "/tmp/test",
  });
  expect(result2).toContain("updated");

  const neighbors = store.getNeighbors("src/a.ts::foo:1", { direction: "out", kind: "calls" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.edge.provenance.evidence).toBe("updated evidence");
  expect(neighbors[0]!.edge.provenance.content_hash).toBe("hash_v2");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: FAIL — second call still returns `"created"` instead of `"updated"`

**Step 3 — Write minimal implementation**
```typescript
// src/tools/resolve-edge.ts (inside resolveEdge, before addEdge)
const existingNeighbors = store.getNeighbors(sourceNode.id, { direction: "out", kind });
const existed = existingNeighbors.some(
  (nr) => nr.edge.target === targetNode.id && nr.edge.provenance.source === "agent"
);

store.addEdge({
  source: sourceNode.id,
  target: targetNode.id,
  kind,
  provenance: {
    source: "agent",
    confidence: 0.7,
    evidence,
    content_hash: contentHash,
  },
  created_at: Date.now(),
});

const action = existed ? "updated" : "created";
return [
  `Edge ${action}:`,
  `  source: ${sourceAnchor.anchor}  ${sourceNode.name}`,
  `  target: ${targetAnchor.anchor}  ${targetNode.name}`,
  `  kind: ${kind}`,
  "  provenance: agent  confidence:0.7",
].join("\n");
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 8: deleteFile preserves agent edges while removing non-agent edges [depends: 6]

### Task 8: deleteFile preserves agent edges while removing non-agent edges [depends: 6]

Covers AC 11 and AC 12.

**Files:**
- Test: `test/graph-store-delete-agent-edges.test.ts`
- Modify: `src/graph/sqlite.ts`

**Step 1 — Write the failing test**
```typescript
// test/graph-store-delete-agent-edges.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("deleteFile preserves agent edges while still deleting file nodes and hash", () => {
  const store = new SqliteGraphStore();

  const nodeA = { id: "src/a.ts::foo:1", kind: "function" as const, name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "ha" };
  const nodeB = { id: "src/b.ts::bar:1", kind: "function" as const, name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "hb" };

  store.addNode(nodeA);
  store.addNode(nodeB);
  store.setFileHash("src/a.ts", "fha");

  store.addEdge({
    source: nodeA.id,
    target: nodeB.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: "e1" },
    created_at: 1,
  });

  store.addEdge({
    source: nodeA.id,
    target: nodeB.id,
    kind: "imports",
    provenance: { source: "agent", confidence: 0.7, evidence: "agent resolved", content_hash: "e2" },
    created_at: 2,
  });

  store.deleteFile("src/a.ts");

  // AC12
  expect(store.getNodesByFile("src/a.ts")).toEqual([]);
  expect(store.getFileHash("src/a.ts")).toBeNull();

  // AC11
  store.addNode(nodeA);
  const neighbors = store.getNeighbors(nodeA.id, { direction: "out" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.edge.provenance.source).toBe("agent");
  expect(neighbors[0]!.edge.kind).toBe("imports");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-delete-agent-edges.test.ts`
Expected: FAIL — `expect(received).toHaveLength(expected)` because `deleteFile` currently deletes all edges, including agent edges

**Step 3 — Write minimal implementation**
```typescript
// src/graph/sqlite.ts
deleteFile(file: string): void {
  this.db.exec("BEGIN");
  try {
    this.db
      .query(
        `DELETE FROM edges
         WHERE provenance_source != 'agent'
           AND (source IN (SELECT id FROM nodes WHERE file = ?)
             OR target IN (SELECT id FROM nodes WHERE file = ?))`
      )
      .run(file, file);

    this.db.query(`DELETE FROM nodes WHERE file = ?`).run(file);
    this.db.query(`DELETE FROM file_hashes WHERE file = ?`).run(file);

    this.db.exec("COMMIT");
  } catch (error) {
    this.db.exec("ROLLBACK");
    throw error;
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-delete-agent-edges.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 9: symbolGraph marks stale agent edges in output [depends: 6]

### Task 9: symbolGraph marks stale agent edges in output [depends: 6]

Covers AC 13 — agent edges whose content_hash differs from the current `store.getFileHash` for the source node's file are marked `[stale]` in output.

**Files:**
- Test: `test/tool-symbol-graph-stale-agent.test.ts`
- Modify: `src/tools/symbol-graph.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-graph-stale-agent.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolGraph marks stale agent edges with [stale]", () => {
  const projectRoot = join(tmpdir(), `pi-cg-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() {}\n";
  const fileBContent = "export function bar() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);

  const hashA = sha256Hex(fileAContent);
  const hashB = sha256Hex(fileBContent);

  try {
    const store = new SqliteGraphStore();

    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: hashA,
    });
    store.addNode({
      id: "src/b.ts::bar:1",
      kind: "function",
      name: "bar",
      file: "src/b.ts",
      start_line: 1,
      end_line: 1,
      content_hash: hashB,
    });

    // Set file hash in the store
    store.setFileHash("src/a.ts", hashA);

    // Agent edge with matching content_hash (fresh)
    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "agent",
        confidence: 0.7,
        evidence: "foo calls bar",
        content_hash: hashA,  // matches current file hash
      },
      created_at: Date.now(),
    });

    // Query foo — the agent edge to bar should NOT be stale
    const freshOutput = symbolGraph({ name: "foo", store, projectRoot });
    expect(freshOutput).toContain("bar");
    expect(freshOutput).toContain("Callees");
    // The callee line for bar should not have [stale]
    const freshLines = freshOutput.split("\n").filter(l => l.includes("bar") && l.includes("calls"));
    expect(freshLines.length).toBeGreaterThan(0);
    expect(freshLines[0]).not.toContain("[stale]");

    // Now update the file hash to simulate source file changed
    store.setFileHash("src/a.ts", "new_different_hash");

    // Query foo again — the agent edge should now be marked [stale]
    const staleOutput = symbolGraph({ name: "foo", store, projectRoot });
    expect(staleOutput).toContain("bar");
    // The callee line for bar should have [stale] since agent edge content_hash != current file hash
    const staleLines = staleOutput.split("\n").filter(l => l.includes("bar") && l.includes("calls"));
    expect(staleLines.length).toBeGreaterThan(0);
    expect(staleLines[0]).toContain("[stale]");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-stale-agent.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` — the stale line for bar does not contain `[stale]` because `symbolGraph` currently does not check agent edge content_hash vs file hash

**Step 3 — Write minimal implementation**

Update `src/tools/symbol-graph.ts` to check agent edge staleness. The `toAnchoredNeighbor` function needs access to the store to check if the edge's content_hash matches the current file hash for agent edges.

```typescript
// src/tools/symbol-graph.ts
import type { GraphStore, NeighborResult } from "../graph/store.js";
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  type AnchoredNeighbor,
  type NeighborSection,
} from "../output/anchoring.js";

export interface SymbolGraphParams {
  name: string;
  file?: string;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}

function isAgentEdgeStale(nr: NeighborResult, store: GraphStore): boolean {
  if (nr.edge.provenance.source !== "agent") return false;
  // Get the source node to find its file
  const sourceNode = store.getNode(nr.edge.source);
  if (!sourceNode) return true;
  const currentFileHash = store.getFileHash(sourceNode.file);
  if (!currentFileHash) return true;
  return nr.edge.provenance.content_hash !== currentFileHash;
}

function toAnchoredNeighbor(nr: NeighborResult, projectRoot: string, store: GraphStore): AnchoredNeighbor {
  const anchor = computeAnchor(nr.node, projectRoot);
  const stale = isAgentEdgeStale(nr, store);
  return {
    anchor: stale ? { ...anchor, stale: true } : anchor,
    name: nr.node.name,
    edgeKind: nr.edge.kind,
    confidence: nr.edge.provenance.confidence,
    provenanceSource: nr.edge.provenance.source,
  };
}

function buildSection(
  neighbors: NeighborResult[],
  limit: number,
  projectRoot: string,
  store: GraphStore,
): NeighborSection {
  const ranked = rankNeighbors(neighbors, limit);
  return {
    items: ranked.kept.map((nr) => toAnchoredNeighbor(nr, projectRoot, store)),
    omitted: ranked.omitted,
  };
}

export function symbolGraph(params: SymbolGraphParams): string {
  const { name, file, limit = 10, store, projectRoot } = params;

  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return `Symbol "${name}" not found`;
  }

  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    return `${lines.join("\n")}\n`;
  }

  const node = nodes[0]!;
  const symbolAnchor = computeAnchor(node, projectRoot);

  const allNeighbors = store.getNeighbors(node.id);

  const callerResults: NeighborResult[] = [];
  const calleeResults: NeighborResult[] = [];
  const importResults: NeighborResult[] = [];
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of allNeighbors) {
    if (nr.node.file.startsWith("__unresolved__")) {
      unresolvedResults.push(nr);
      continue;
    }

    if (nr.edge.kind === "calls") {
      if (nr.edge.target === node.id) {
        callerResults.push(nr);
      } else {
        calleeResults.push(nr);
      }
    } else if (nr.edge.kind === "imports" && nr.edge.source === node.id) {
      importResults.push(nr);
    }
  }

  const callers = buildSection(callerResults, limit, projectRoot, store);
  const callees = buildSection(calleeResults, limit, projectRoot, store);
  const imports = buildSection(importResults, limit, projectRoot, store);
  const unresolved = buildSection(unresolvedResults, limit, projectRoot, store);

  return formatNeighborhood(
    { name: node.name, kind: node.kind, anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved,
  );
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-stale-agent.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 10: Pi extension registers symbol_graph tool with TypeBox schema [depends: 6]

### Task 10: Pi extension registers symbol_graph tool with TypeBox schema [depends: 6]

Covers AC 14 only.

**Files:**
- Test: `test/extension-wiring.test.ts`
- Modify: `src/index.ts`

**Step 1 — Write the failing test**
```typescript
// test/extension-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers symbol_graph tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const sgTool = registeredTools.find((t) => t.name === "symbol_graph");
  expect(sgTool).toBeDefined();

  const schema = sgTool!.parameters as any;
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("name");
  expect(schema.required).not.toContain("file");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` because `symbol_graph` is not registered yet

**Step 3 — Write minimal implementation**
```typescript
// src/index.ts
import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

export default function piCodegraph(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Look up a symbol and return its anchored neighborhood",
    parameters: SymbolGraphParams,
    async execute() {
      return { content: [{ type: "text", text: "not implemented" }] };
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 11: Pi extension registers resolve_edge tool with TypeBox schema [depends: 10]

### Task 11: Pi extension registers resolve_edge tool with TypeBox schema [depends: 10]

Covers AC 15.

**Files:**
- Test: `test/extension-wiring.test.ts`
- Modify: `src/index.ts`

**Step 1 — Write the failing test**
```typescript
// Append to test/extension-wiring.test.ts
test("pi extension registers resolve_edge tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const reTool = registeredTools.find((t) => t.name === "resolve_edge");
  expect(reTool).toBeDefined();

  const schema = reTool!.parameters as any;
  expect(schema.properties.source).toBeDefined();
  expect(schema.properties.target).toBeDefined();
  expect(schema.properties.kind).toBeDefined();
  expect(schema.properties.evidence).toBeDefined();
  expect(schema.required).toContain("source");
  expect(schema.required).toContain("target");
  expect(schema.required).toContain("kind");
  expect(schema.required).toContain("evidence");
  expect(schema.properties.sourceFile).toBeDefined();
  expect(schema.properties.targetFile).toBeDefined();
  expect(schema.required).not.toContain("sourceFile");
  expect(schema.required).not.toContain("targetFile");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` because `resolve_edge` is not registered yet

**Step 3 — Write minimal implementation**
```typescript
// src/index.ts
import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

const ResolveEdgeParams = Type.Object({
  source: Type.String(),
  target: Type.String(),
  kind: Type.String(),
  evidence: Type.String(),
  sourceFile: Type.Optional(Type.String()),
  targetFile: Type.Optional(Type.String()),
});

export default function piCodegraph(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Look up a symbol and return its anchored neighborhood",
    parameters: SymbolGraphParams,
    async execute() {
      return {
        content: [{ type: "text", text: "not implemented" }],
        details: undefined,
      };
    },
  });

  pi.registerTool({
    name: "resolve_edge",
    label: "Resolve Edge",
    description: "Create an edge in the symbol graph with evidence",
    parameters: ResolveEdgeParams,
    async execute() {
      return {
        content: [{ type: "text", text: "not implemented" }],
        details: undefined,
      };
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 12: Extension auto-indexes when store is empty and shares singleton store [depends: 11]

### Task 12: Extension auto-indexes when store is empty and shares singleton store [depends: 11]

Covers AC 16, AC 17, AC 18, and AC 19.

**Files:**
- Test: `test/extension-auto-index.test.ts`
- Modify: `src/index.ts`

**Step 1 — Write the failing test**
```typescript
// test/extension-auto-index.test.ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extension shares singleton store instance across symbol_graph and resolve_edge", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-singleton-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/alpha.ts"), "export function alpha() {}\nexport function beta() { alpha(); }\n");

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    let reExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
        if (tool.name === "resolve_edge") reExecute = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const ctx = { cwd: projectRoot };

    await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
    const first = mod.getSharedStoreForTesting();

    await reExecute!(
      "call-2",
      { source: "beta", target: "alpha", kind: "calls", evidence: "beta calls alpha" },
      undefined,
      undefined,
      ctx,
    );
    const second = mod.getSharedStoreForTesting();

    expect(first).toBeDefined();
    expect(second).toBe(first);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("extension auto-indexes project on first tool call when DB is empty", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-autoindex-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/hello.ts"), "export function hello() { return 'world'; }\n");

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const result = await sgExecute!("test-call-id", { name: "hello" }, undefined, undefined, { cwd: projectRoot });

    expect(existsSync(join(projectRoot, ".codegraph", "graph.db"))).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("hello");
    expect(text).toContain("function");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-auto-index.test.ts`
Expected: FAIL — `TypeError: mod.getSharedStoreForTesting is not a function`

**Step 3 — Write minimal implementation**
```typescript
// src/index.ts
import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "./graph/store.js";
import { SqliteGraphStore } from "./graph/sqlite.js";
import { indexProject } from "./indexer/pipeline.js";
import { resolveEdge } from "./tools/resolve-edge.js";
import { symbolGraph } from "./tools/symbol-graph.js";

const SymbolGraphParams = Type.Object({
  name: Type.String(),
  file: Type.Optional(Type.String()),
});

const ResolveEdgeParams = Type.Object({
  source: Type.String(),
  target: Type.String(),
  kind: Type.String(),
  evidence: Type.String(),
  sourceFile: Type.Optional(Type.String()),
  targetFile: Type.Optional(Type.String()),
});

let sharedStore: GraphStore | null = null;

export function getSharedStoreForTesting(): GraphStore | null {
  return sharedStore;
}

export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
}

function getOrCreateStore(projectRoot: string): GraphStore {
  if (sharedStore) return sharedStore;
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  sharedStore = new SqliteGraphStore(join(dbDir, "graph.db"));
  return sharedStore;
}

function ensureIndexed(projectRoot: string, store: GraphStore): void {
  if (store.listFiles().length === 0) {
    indexProject(projectRoot, store);
  }
}

export default function piCodegraph(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Look up a symbol and return its anchored neighborhood",
    parameters: SymbolGraphParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      ensureIndexed(projectRoot, store);
      const output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  pi.registerTool({
    name: "resolve_edge",
    label: "Resolve Edge",
    description: "Create an edge in the symbol graph with evidence",
    parameters: ResolveEdgeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      ensureIndexed(projectRoot, store);
      const output = resolveEdge({
        source: params.source,
        target: params.target,
        sourceFile: params.sourceFile,
        targetFile: params.targetFile,
        kind: params.kind,
        evidence: params.evidence,
        store,
        projectRoot,
      });
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-auto-index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
