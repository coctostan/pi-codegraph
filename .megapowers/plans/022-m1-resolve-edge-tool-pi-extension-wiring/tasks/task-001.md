---
id: 1
title: resolveEdge returns error when source symbol not found
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/resolve-edge.ts
files_to_create:
  - test/tool-resolve-edge.test.ts
---

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
