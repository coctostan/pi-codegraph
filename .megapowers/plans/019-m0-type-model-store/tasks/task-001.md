---
id: 1
title: "Type model: define unions/interfaces and nodeId helper"
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/graph/types.ts
  - test/graph-types.typecheck.ts
files_to_create: []
---

Implement AC 1–10 with explicit 5-step compile-time TDD.

### Step 1 — Add full typecheck test code (RED setup)
Update `test/graph-types.typecheck.ts` to this exact content:

```ts
import type { GraphEdge, GraphNode, Provenance } from "../src/graph/types.js";
import { nodeId } from "../src/graph/types.js";

const validNode: GraphNode = {
  id: "src/a.ts::foo:10",
  kind: "function",
  name: "foo",
  file: "src/a.ts",
  start_line: 10,
  end_line: 20,
  content_hash: "hash-node",
};

const validEdge: GraphEdge = {
  source: "src/a.ts::foo:10",
  target: "src/b.ts::bar:3",
  kind: "calls",
  provenance: {
    source: "tree-sitter",
    confidence: 0.8,
    evidence: "foo() calls bar()",
    content_hash: "hash-edge",
  },
  created_at: 1700000000,
};

const validProvenance: Provenance = {
  source: "lsp",
  confidence: 1,
  evidence: "go-to-definition",
  content_hash: "hash-prov",
};

const id = nodeId("src/a.ts", "foo", 10);
if (id !== "src/a.ts::foo:10") {
  throw new Error(`unexpected nodeId: ${id}`);
}

// @ts-expect-error invalid NodeKind must be rejected
const invalidNodeKind: GraphNode = { ...validNode, kind: "not-a-kind" };

// @ts-expect-error invalid EdgeKind must be rejected
const invalidEdgeKind: GraphEdge = { ...validEdge, kind: "not-a-kind" };

// @ts-expect-error invalid ProvenanceSource must be rejected
const invalidProvSource: Provenance = { ...validProvenance, source: "not-a-kind" };

void [
  validNode,
  validEdge,
  validProvenance,
  invalidNodeKind,
  invalidEdgeKind,
  invalidProvSource,
];
export {};
```

### Step 2 — Run typecheck and expect RED
Command:
```bash
bun run check
```
Expected failure contains at least:
- `Object literal may only specify known properties, and 'start_line' does not exist in type 'GraphNode'.`

### Step 3 — Implement full production code
Replace `src/graph/types.ts` with:

```ts
export type NodeKind =
  | "function"
  | "class"
  | "interface"
  | "module"
  | "endpoint"
  | "test";

export type EdgeKind =
  | "calls"
  | "imports"
  | "implements"
  | "extends"
  | "tested_by"
  | "co_changes_with"
  | "renders"
  | "routes_to";

export type ProvenanceSource =
  | "tree-sitter"
  | "lsp"
  | "ast-grep"
  | "coverage"
  | "git"
  | "agent";

export interface Provenance {
  source: ProvenanceSource;
  confidence: number;
  evidence: string;
  content_hash: string;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  provenance: Provenance;
  created_at: number;
}

export function nodeId(file: string, name: string, startLine: number): string {
  return `${file}::${name}:${startLine}`;
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

**Acceptance criteria covered:** 1–10
