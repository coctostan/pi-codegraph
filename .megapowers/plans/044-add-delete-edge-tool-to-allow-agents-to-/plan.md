# Plan

### Task 1: deleteEdge core function — successful deletion of agent edge

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

### Task 2: deleteEdge returns not-found when source symbol is missing [depends: 1]

Covers: AC 3 (source not found returns message naming the symbol)

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge returns error when source symbol not found", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::bar:1", kind: "function", name: "bar", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });

  const result = deleteEdge({
    source: "nonexistent",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("not found");
  expect(result).toContain("nonexistent");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-delete-edge.test.ts -t "source symbol not found"`
Expected: PASS — this is already handled by the Task 1 implementation. The test is additive coverage, confirming the behavior.

**Step 3 — Write minimal implementation**

No new implementation code needed — Task 1's `deleteEdge` already returns `Source symbol "${source}" not found` when `findNodes` returns empty.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: deleteEdge returns not-found when target symbol is missing [depends: 1]

Covers: AC 3 (target not found returns message naming the symbol)

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge returns error when target symbol not found", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });

  const result = deleteEdge({
    source: "foo",
    target: "nonexistent",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("not found");
  expect(result).toContain("nonexistent");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-delete-edge.test.ts -t "target symbol not found"`
Expected: PASS — already handled by Task 1 implementation.

**Step 3 — Write minimal implementation**

No new code — `deleteEdge` already returns `Target symbol "${target}" not found`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: deleteEdge returns disambiguation list for ambiguous source [depends: 1]

Covers: AC 4 (ambiguous source returns disambiguation list)

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge returns disambiguation list when source has multiple matches", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::foo:5", kind: "class", name: "foo", file: "src/b.ts", start_line: 5, end_line: 10, content_hash: "h2" });
  store.addNode({ id: "src/a.ts::bar:10", kind: "function", name: "bar", file: "src/a.ts", start_line: 10, end_line: 12, content_hash: "h1" });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Ambiguous source");
  expect(result).toContain("src/a.ts");
  expect(result).toContain("src/b.ts");
  expect(result).toContain("function");
  expect(result).toContain("class");
  expect(result).toContain("line 1");
  expect(result).toContain("line 5");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-delete-edge.test.ts -t "disambiguation list when source"`
Expected: PASS — already handled by Task 1 implementation.

**Step 3 — Write minimal implementation**

No new code — `deleteEdge` already calls `formatDisambiguation("source", sourceNodes)`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: deleteEdge returns disambiguation list for ambiguous target [depends: 1]

Covers: AC 4 (ambiguous target returns disambiguation list)

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge returns disambiguation list when target has multiple matches", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/a.ts::bar:5", kind: "function", name: "bar", file: "src/a.ts", start_line: 5, end_line: 7, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "class", name: "bar", file: "src/b.ts", start_line: 1, end_line: 10, content_hash: "h2" });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
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
Run: `bun test test/tool-delete-edge.test.ts -t "disambiguation list when target"`
Expected: PASS — already handled by Task 1 implementation.

**Step 3 — Write minimal implementation**

No new code — `deleteEdge` already calls `formatDisambiguation("target", targetNodes)`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: deleteEdge rejects invalid edge kinds [depends: 1]

Covers: AC 5 (validates kind against EdgeKind set)

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge rejects invalid edge kinds", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/a.ts::bar:5", kind: "function", name: "bar", file: "src/a.ts", start_line: 5, end_line: 7, content_hash: "h1" });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "invalid_kind",
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
Run: `bun test test/tool-delete-edge.test.ts -t "rejects invalid edge kinds"`
Expected: PASS — already handled by Task 1 implementation.

**Step 3 — Write minimal implementation**

No new code — `deleteEdge` already validates with `isValidEdgeKind`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: deleteEdge returns not-found when no matching agent edge exists [depends: 1]

Covers: AC 6 (no matching agent edge returns "not found")

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge returns not-found when no agent edge exists between symbols", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  // No edge exists at all
  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("No agent edge found");
  expect(result).toContain("foo");
  expect(result).toContain("bar");
  expect(result).toContain("calls");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-delete-edge.test.ts -t "no agent edge exists"`
Expected: PASS — already handled by Task 1 implementation.

**Step 3 — Write minimal implementation**

No new code — `deleteEdge` already checks for agent edge via `getNeighbors` and returns the not-found message.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 8: deleteEdge cannot delete non-agent edges [depends: 1]

Covers: AC 7 (only agent-provenance edges are deletable — non-agent edge reports not found)

**Files:**
- Modify: `test/tool-delete-edge.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-delete-edge.test.ts`:

```typescript
test("deleteEdge reports not-found when only a non-agent edge exists", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  // Add a tree-sitter edge (non-agent)
  store.addEdge({
    source: "src/a.ts::foo:1",
    target: "src/b.ts::bar:1",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: "h1" },
    created_at: Date.now(),
  });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("No agent edge found");

  // Verify the tree-sitter edge is still there
  const neighbors = store.getNeighbors("src/a.ts::foo:1", { direction: "out", kind: "calls" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.edge.provenance.source).toBe("tree-sitter");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-delete-edge.test.ts -t "only a non-agent edge"`
Expected: PASS — the existence check filters on `provenance.source === "agent"`, so a tree-sitter edge won't match.

**Step 3 — Write minimal implementation**

No new code — already handled by the agent-provenance filter in Task 1.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-delete-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 9: Register delete_edge tool in pi extension [depends: 1]

Covers: AC 1 (tool registered in index.ts), AC 2 (accepts correct params), AC 9 (readonly error handling)

**Files:**
- Modify: `src/index.ts`
- Modify: `test/extension-wiring.test.ts`

**Step 1 — Write the failing test**

Append to `test/extension-wiring.test.ts`:

```typescript
test("pi extension registers delete_edge tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const deTool = registeredTools.find((t) => t.name === "delete_edge");
  expect(deTool).toBeDefined();

  const schema = deTool!.parameters as any;
  expect(schema.properties.source).toBeDefined();
  expect(schema.properties.target).toBeDefined();
  expect(schema.properties.kind).toBeDefined();
  expect(schema.required).toContain("source");
  expect(schema.required).toContain("target");
  expect(schema.required).toContain("kind");
  expect(schema.properties.sourceFile).toBeDefined();
  expect(schema.properties.targetFile).toBeDefined();
  expect(schema.required).not.toContain("sourceFile");
  expect(schema.required).not.toContain("targetFile");
  // No evidence param (unlike resolve_edge)
  expect(schema.properties.evidence).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-wiring.test.ts -t "delete_edge"`
Expected: FAIL — `expect(received).toBeDefined()` because no `delete_edge` tool is registered yet.

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at the top:
```typescript
import { deleteEdge } from "./tools/delete-edge.js";
```

2. Add Typebox params after existing param definitions:
```typescript
const DeleteEdgeParams = Type.Object({
  source: Type.String({ description: "Source symbol name" }),
  target: Type.String({ description: "Target symbol name" }),
  kind: Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" }),
  sourceFile: Type.Optional(Type.String({ description: "Source file path to disambiguate" })),
  targetFile: Type.Optional(Type.String({ description: "Target file path to disambiguate" })),
});
```

3. Add tool registration inside `piCodegraph()`, after the `resolve_edge` registration block:
```typescript
  pi.registerTool({
    name: "delete_edge",
    label: "Delete Edge",
    description: "Delete an agent-created edge from the symbol graph",
    parameters: DeleteEdgeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output: string;
      try {
        output = deleteEdge({
          source: params.source,
          target: params.target,
          sourceFile: params.sourceFile,
          targetFile: params.targetFile,
          kind: params.kind,
          store,
          projectRoot,
        });
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes("readonly")) {
          output = "Cannot delete edge: database is readonly. Re-index the project to enable writes.";
        } else {
          throw err;
        }
      }
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-wiring.test.ts -t "delete_edge"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
