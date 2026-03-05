---
id: 2
title: resolveEdge returns error when target symbol not found
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/resolve-edge.ts
  - test/tool-resolve-edge.test.ts
files_to_create: []
---

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
