---
id: 2
title: "GraphStore contract: NeighborOptions, NeighborResult, and method signatures"
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/graph/store.ts
  - test/graph-types.typecheck.ts
files_to_create: []
---

Implement AC 11–21 with explicit compile-time TDD.

### Step 1 — Add full compile-time contract tests (RED setup)
Append this block to `test/graph-types.typecheck.ts`:

```ts
import type { GraphStore } from "../src/graph/store.js";

const validStore: GraphStore = {
  addNode: () => {},
  addEdge: () => {},
  getNode: () => null,
  getNeighbors: () => [],
  getNodesByFile: () => [],
  deleteFile: () => {},
  getFileHash: () => null,
  setFileHash: () => {},
  close: () => {},
};

// @ts-expect-error GraphStore must require all 9 methods
const invalidStore: GraphStore = {};

void [validStore, invalidStore];
```

### Step 2 — Run typecheck and expect RED
Command:
```bash
bun run check
```
Expected failure contains:
- `Unused '@ts-expect-error' directive.`

### Step 3 — Implement full production code
Replace `src/graph/store.ts` with:

```ts
import type { EdgeKind, GraphEdge, GraphNode } from "./types.js";

export interface NeighborOptions {
  kind?: EdgeKind;
  direction?: "in" | "out" | "both";
}

export interface NeighborResult {
  node: GraphNode;
  edge: GraphEdge;
}

export interface GraphStore {
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | null;
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
  getNodesByFile(file: string): GraphNode[];
  deleteFile(file: string): void;
  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  close(): void;
}
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun run check
```
Expected: PASS (exit code 0)

### Step 5 — Run full suite
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 11–21
