---
id: 5
title: resolveEdge rejects invalid edge kinds
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/tools/resolve-edge.ts
  - test/tool-resolve-edge.test.ts
files_to_create: []
---

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
