---
id: 2
title: Prepend trust header to symbol_graph
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/symbol-graph.ts
files_to_create:
  - test/tool-symbol-graph-trust-header.test.ts
---

### Task 2: Prepend trust header to symbol_graph [depends: 1]

**Files:**
- Modify: `src/tools/symbol-graph.ts`
- Test: `test/tool-symbol-graph-trust-header.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph prepends the shared trust header and keeps stale row markers local", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-trust-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fooContent = "export function foo() { return bar(); }\n";
  const barContent = "export function bar() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "a.ts"), fooContent);
  writeFileSync(join(projectRoot, "src", "b.ts"), barContent);

  const fooHash = sha256Hex(fooContent);
  const barHash = sha256Hex(barContent);
  const store = new SqliteGraphStore();

  try {
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: fooHash,
      is_exported: true,
    });
    store.addNode({
      id: "src/b.ts::bar:1",
      kind: "function",
      name: "bar",
      file: "src/b.ts",
      start_line: 1,
      end_line: 1,
      content_hash: barHash,
      is_exported: false,
    });
    store.setFileHash("src/a.ts", fooHash);

    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "agent",
        confidence: 0.7,
        evidence: "foo calls bar",
        content_hash: fooHash,
      },
      created_at: 1,
    });

    const freshOutput = symbolGraph({ name: "foo", file: "src/a.ts", store, projectRoot });
    const freshLines = freshOutput.trimEnd().split("\n");

    expect(freshLines[0]).toBe("## Trust");
    expect(freshLines[1]).toBe("status: fresh");
    expect(freshLines[2]).toBe("evidence: agent  stale-files: 0/1");
    expect(freshOutput).toContain("## foo (function)");
    expect(freshOutput).not.toContain("bar  calls  confidence:0.7  agent [stale]");

    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "agent",
        confidence: 0.7,
        evidence: "foo calls bar",
        content_hash: "old-hash",
      },
      created_at: 2,
    });

    const mixedOutput = symbolGraph({ name: "foo", file: "src/a.ts", store, projectRoot });
    const mixedLines = mixedOutput.trimEnd().split("\n");

    expect(mixedLines[0]).toBe("## Trust");
    expect(mixedLines[1]).toBe("status: mixed");
    expect(mixedLines[2]).toBe("evidence: agent  stale-files: 0/1");
    expect(mixedOutput).toContain("bar  calls  confidence:0.7  agent [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-trust-header.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` with `Expected: "## Trust"` and `Received: "## foo (function)"`

**Step 3 — Write minimal implementation**
```ts
import type { GraphStore, NeighborResult } from "../graph/store.js";
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  type AnchoredNeighbor,
  type NeighborSection,
} from "../output/anchoring.js";
import { createSignalComputer, type NodeSignals } from "../output/signals.js";
import { prependTrustHeader } from "../output/trust.js";

export interface SymbolGraphParams {
  name: string;
  file?: string;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}

function isAgentEdgeStale(nr: NeighborResult, store: GraphStore): boolean {
  if (nr.edge.provenance.source !== "agent") return false;
  const sourceNode = store.getNode(nr.edge.source);
  if (!sourceNode) return true;
  const currentFileHash = store.getFileHash(sourceNode.file);
  if (!currentFileHash) return true;
  return nr.edge.provenance.content_hash !== currentFileHash;
}

function toAnchoredNeighbor(
  nr: NeighborResult,
  projectRoot: string,
  store: GraphStore,
  computeSignals?: (nodeId: string) => NodeSignals,
): AnchoredNeighbor {
  const anchor = computeAnchor(nr.node, projectRoot);
  const agentStale = isAgentEdgeStale(nr, store);
  const effectiveAnchor = agentStale ? { ...anchor, stale: true } : anchor;
  return {
    anchor: effectiveAnchor,
    name: nr.node.name,
    edgeKind: nr.edge.kind,
    confidence: nr.edge.provenance.confidence,
    provenanceSource: nr.edge.provenance.source,
    signals: computeSignals ? computeSignals(nr.node.id) : undefined,
  };
}

function buildSection(
  neighbors: NeighborResult[],
  limit: number,
  projectRoot: string,
  store: GraphStore,
  computeSignals?: (nodeId: string) => NodeSignals,
): NeighborSection {
  const ranked = rankNeighbors(neighbors, limit);
  return {
    items: ranked.kept.map((nr) => toAnchoredNeighbor(nr, projectRoot, store, computeSignals)),
    omitted: ranked.omitted,
  };
}

function hasStaleItems(section: NeighborSection): boolean {
  return section.items.some((item) => item.anchor.stale);
}

export function symbolGraph(params: SymbolGraphParams): string {
  const { name, file, limit = 10, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return prependTrustHeader(`Symbol "${name}" not found`, { stats });
  }

  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    const hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
    return prependTrustHeader(body, { stats, hasLocalExceptions });
  }

  const node = nodes[0]!;
  const symbolAnchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
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

  const callers = buildSection(callerResults, limit, projectRoot, store, (nodeId) => signalComputer.compute(nodeId));
  const callees = buildSection(calleeResults, limit, projectRoot, store, (nodeId) => signalComputer.compute(nodeId));
  const imports = buildSection(importResults, limit, projectRoot, store, (nodeId) => signalComputer.compute(nodeId));
  const unresolved = buildSection(unresolvedResults, limit, projectRoot, store);

  const body = formatNeighborhood(
    { name: node.name, kind: node.kind, anchor: symbolAnchor, signals: signalComputer.compute(node.id) },
    callers,
    callees,
    imports,
    unresolved,
  );

  const hasLocalExceptions = symbolAnchor.stale
    || hasStaleItems(callers)
    || hasStaleItems(callees)
    || hasStaleItems(imports)
    || hasStaleItems(unresolved);

  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-trust-header.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
