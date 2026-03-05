---
id: 3
title: Add graph placeholder types with typecheck test
status: approved
depends_on:
  - 2
no_test: false
files_to_modify: []
files_to_create:
  - test/graph-types.typecheck.ts
  - src/graph/types.ts
---

### Task 3: Add graph placeholder types with typecheck test [depends: 2]

**Covers:** AC 5, AC 15

**Files:**
- Create: `test/graph-types.typecheck.ts`
- Create: `src/graph/types.ts`

**Step 1 — Write the failing test**

Create `test/graph-types.typecheck.ts`:

```ts
import type { GraphEdge, GraphNode, Provenance } from "../src/graph/types.js";

const _node: GraphNode = {
  id: "n1",
  kind: "function",
  name: "run",
  file: "src/run.ts",
  line: 1,
};

const _edge: GraphEdge = {
  source: "n1",
  target: "n2",
  kind: "calls",
};

const _provenance: Provenance = {
  source: "tree-sitter",
  confidence: 0.8,
};

void [_node, _edge, _provenance];
export {};
```

**Step 2 — Run test, verify it fails**

Run: `bun run check`

Expected: FAIL — `TS2307: Cannot find module '../src/graph/types.js' or its corresponding type declarations.`

**Step 3 — Write minimal implementation**

Create `src/graph/types.ts`:

```ts
export interface GraphNode {
  id: string;
  kind: string;
  name: string;
  file: string;
  line: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
}

export interface Provenance {
  source: string;
  confidence: number;
}
```

**Step 4 — Run test, verify it passes**

Run: `bun run check`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.
