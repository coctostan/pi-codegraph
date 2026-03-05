---
id: 6
title: resolveEdge creates edge with agent provenance and confirmation
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - src/tools/resolve-edge.ts
  - test/tool-resolve-edge.test.ts
files_to_create: []
---

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
