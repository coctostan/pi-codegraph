---
id: 3
title: resolveEdge returns disambiguation list when source has multiple matches
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/resolve-edge.ts
  - test/tool-resolve-edge.test.ts
files_to_create: []
---

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
