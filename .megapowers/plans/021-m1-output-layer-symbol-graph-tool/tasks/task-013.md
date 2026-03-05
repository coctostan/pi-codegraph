---
id: 13
title: symbolGraph returns full neighborhood for unique symbol match
status: approved
depends_on:
  - 1
  - 9
no_test: false
files_to_modify:
  - src/tools/symbol-graph.ts
files_to_create:
  - test/tool-symbol-graph.test.ts
---

**Spec criteria:** 14, 21, 25, 26

**Files:**
- Modify: `src/tools/symbol-graph.ts`
- Create: `test/tool-symbol-graph.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-graph.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function setupFixture(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-sg-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  writeFileSync(
    join(projectRoot, "src/a.ts"),
    "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n"
  );
  writeFileSync(
    join(projectRoot, "src/b.ts"),
    "export function bar() {\n  return 1;\n}\n"
  );

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

test("symbolGraph returns full neighborhood for a unique symbol match", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    // Add nodes
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    // foo calls bar (outgoing edge from foo)
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "foo", store, projectRoot });

    // Header
    expect(output).toContain("foo (function)");
    expect(output).toContain("src/a.ts:3:");

    // Callees section with bar
    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    expect(output).toContain("src/b.ts:1:");
    expect(output).toContain("0.5");
    expect(output).toContain("tree-sitter");

    // No callers for foo
    expect(output).not.toContain("Callers");

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: FAIL — the current `symbolGraph` is a no-op stub returning undefined

**Step 3 — Write minimal implementation**

Replace `src/tools/symbol-graph.ts`:

```typescript
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

function toAnchoredNeighbor(
  nr: NeighborResult,
  projectRoot: string
): AnchoredNeighbor {
  const anchor = computeAnchor(nr.node, projectRoot);
  return {
    anchor,
    name: nr.node.name,
    edgeKind: nr.edge.kind,
    confidence: nr.edge.provenance.confidence,
    provenanceSource: nr.edge.provenance.source,
  };
}

function buildSection(
  neighbors: NeighborResult[],
  limit: number,
  projectRoot: string
): NeighborSection {
  const ranked = rankNeighbors(neighbors, limit);
  return {
    items: ranked.kept.map((nr) => toAnchoredNeighbor(nr, projectRoot)),
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
    // Disambiguation list
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    return lines.join("\n") + "\n";
  }

  const node = nodes[0]!;
  const symbolAnchor = computeAnchor(node, projectRoot);

  const allNeighbors = store.getNeighbors(node.id);

  // Bucket by direction and kind
  const callerResults: NeighborResult[] = [];
  const calleeResults: NeighborResult[] = [];
  const importResults: NeighborResult[] = [];
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of allNeighbors) {
    // Check if unresolved
    if (nr.node.file.startsWith("__unresolved__")) {
      unresolvedResults.push(nr);
      continue;
    }

    if (nr.edge.kind === "calls") {
      if (nr.edge.target === node.id) {
        // Incoming call: this neighbor calls our symbol
        callerResults.push(nr);
      } else {
        // Outgoing call: our symbol calls this neighbor
        calleeResults.push(nr);
      }
    } else if (nr.edge.kind === "imports") {
      importResults.push(nr);
    }
  }

  const callers = buildSection(callerResults, limit, projectRoot);
  const callees = buildSection(calleeResults, limit, projectRoot);
  const imports = buildSection(importResults, limit, projectRoot);
  const unresolved = buildSection(unresolvedResults, limit, projectRoot);

  return formatNeighborhood(
    { name: node.name, kind: node.kind, anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved
  );
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
