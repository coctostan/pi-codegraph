---
id: 9
title: symbolGraph marks stale agent edges in output
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/tools/symbol-graph.ts
files_to_create:
  - test/tool-symbol-graph-stale-agent.test.ts
---

### Task 9: symbolGraph marks stale agent edges in output [depends: 6]

Covers AC 13 — agent edges whose content_hash differs from the current `store.getFileHash` for the source node's file are marked `[stale]` in output.

**Files:**
- Test: `test/tool-symbol-graph-stale-agent.test.ts`
- Modify: `src/tools/symbol-graph.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-graph-stale-agent.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolGraph marks stale agent edges with [stale]", () => {
  const projectRoot = join(tmpdir(), `pi-cg-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() {}\n";
  const fileBContent = "export function bar() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);

  const hashA = sha256Hex(fileAContent);
  const hashB = sha256Hex(fileBContent);

  try {
    const store = new SqliteGraphStore();

    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: hashA,
    });
    store.addNode({
      id: "src/b.ts::bar:1",
      kind: "function",
      name: "bar",
      file: "src/b.ts",
      start_line: 1,
      end_line: 1,
      content_hash: hashB,
    });

    // Set file hash in the store
    store.setFileHash("src/a.ts", hashA);

    // Agent edge with matching content_hash (fresh)
    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "agent",
        confidence: 0.7,
        evidence: "foo calls bar",
        content_hash: hashA,  // matches current file hash
      },
      created_at: Date.now(),
    });

    // Query foo — the agent edge to bar should NOT be stale
    const freshOutput = symbolGraph({ name: "foo", store, projectRoot });
    expect(freshOutput).toContain("bar");
    expect(freshOutput).toContain("Callees");
    // The callee line for bar should not have [stale]
    const freshLines = freshOutput.split("\n").filter(l => l.includes("bar") && l.includes("calls"));
    expect(freshLines.length).toBeGreaterThan(0);
    expect(freshLines[0]).not.toContain("[stale]");

    // Now update the file hash to simulate source file changed
    store.setFileHash("src/a.ts", "new_different_hash");

    // Query foo again — the agent edge should now be marked [stale]
    const staleOutput = symbolGraph({ name: "foo", store, projectRoot });
    expect(staleOutput).toContain("bar");
    // The callee line for bar should have [stale] since agent edge content_hash != current file hash
    const staleLines = staleOutput.split("\n").filter(l => l.includes("bar") && l.includes("calls"));
    expect(staleLines.length).toBeGreaterThan(0);
    expect(staleLines[0]).toContain("[stale]");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-stale-agent.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` — the stale line for bar does not contain `[stale]` because `symbolGraph` currently does not check agent edge content_hash vs file hash

**Step 3 — Write minimal implementation**

Update `src/tools/symbol-graph.ts` to check agent edge staleness. The `toAnchoredNeighbor` function needs access to the store to check if the edge's content_hash matches the current file hash for agent edges.

```typescript
// src/tools/symbol-graph.ts
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

function isAgentEdgeStale(nr: NeighborResult, store: GraphStore): boolean {
  if (nr.edge.provenance.source !== "agent") return false;
  // Get the source node to find its file
  const sourceNode = store.getNode(nr.edge.source);
  if (!sourceNode) return true;
  const currentFileHash = store.getFileHash(sourceNode.file);
  if (!currentFileHash) return true;
  return nr.edge.provenance.content_hash !== currentFileHash;
}

function toAnchoredNeighbor(nr: NeighborResult, projectRoot: string, store: GraphStore): AnchoredNeighbor {
  const anchor = computeAnchor(nr.node, projectRoot);
  const stale = isAgentEdgeStale(nr, store);
  return {
    anchor: stale ? { ...anchor, stale: true } : anchor,
    name: nr.node.name,
    edgeKind: nr.edge.kind,
    confidence: nr.edge.provenance.confidence,
    provenanceSource: nr.edge.provenance.source,
  };
}

function buildSection(
  neighbors: NeighborResult[],
  limit: number,
  projectRoot: string,
  store: GraphStore,
): NeighborSection {
  const ranked = rankNeighbors(neighbors, limit);
  return {
    items: ranked.kept.map((nr) => toAnchoredNeighbor(nr, projectRoot, store)),
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
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    return `${lines.join("\n")}\n`;
  }

  const node = nodes[0]!;
  const symbolAnchor = computeAnchor(node, projectRoot);

  const allNeighbors = store.getNeighbors(node.id);

  const callerResults: NeighborResult[] = [];
  const calleeResults: NeighborResult[] = [];
  const importResults: NeighborResult[] = [];
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of allNeighbors) {
    if (nr.node.file.startsWith("__unresolved__")) {
      unresolvedResults.push(nr);
      continue;
    }

    if (nr.edge.kind === "calls") {
      if (nr.edge.target === node.id) {
        callerResults.push(nr);
      } else {
        calleeResults.push(nr);
      }
    } else if (nr.edge.kind === "imports" && nr.edge.source === node.id) {
      importResults.push(nr);
    }
  }

  const callers = buildSection(callerResults, limit, projectRoot, store);
  const callees = buildSection(calleeResults, limit, projectRoot, store);
  const imports = buildSection(importResults, limit, projectRoot, store);
  const unresolved = buildSection(unresolvedResults, limit, projectRoot, store);

  return formatNeighborhood(
    { name: node.name, kind: node.kind, anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved,
  );
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-stale-agent.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
