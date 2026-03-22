---
id: 3
title: Prepend trust header to impact
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/impact.ts
  - test/extension-impact.test.ts
  - test/tool-impact-output-signals.test.ts
  - test/tool-impact-performance.test.ts
files_to_create:
  - test/tool-impact-trust-header.test.ts
---

### Task 3: Prepend trust header to impact [depends: 1]

**Files:**
- Modify: `src/tools/impact.ts`
- Modify: `test/extension-impact.test.ts` (update assertions for trust header)
- Modify: `test/tool-impact-output-signals.test.ts` (update assertions for trust header)
- Modify: `test/tool-impact-performance.test.ts` (update assertions for trust header)
- Test: `test/tool-impact-trust-header.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { impact } from "../src/tools/impact.js";

test("impact prepends the shared trust header and marks stale-file scenarios as stale", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-trust-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const sharedContent = "export function shared() { return 1; }\n";
  const callerV1 = "import { shared } from './shared';\nexport function caller() { return shared(); }\n";
  const callerV2 = "import { shared } from './shared';\nexport function caller() { return shared() + 1; }\n";

  writeFileSync(join(projectRoot, "src", "shared.ts"), sharedContent);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerV1);

  const sharedHash = sha256Hex(sharedContent);
  const callerHash = sha256Hex(callerV1);
  const store = new SqliteGraphStore();

  try {
    store.addNode({
      id: "src/shared.ts::shared:1",
      kind: "function",
      name: "shared",
      file: "src/shared.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sharedHash,
      is_exported: true,
    });
    store.addNode({
      id: "src/caller.ts::caller:2",
      kind: "function",
      name: "caller",
      file: "src/caller.ts",
      start_line: 2,
      end_line: 2,
      content_hash: callerHash,
      is_exported: false,
    });
    store.addEdge({
      source: "src/caller.ts::caller:2",
      target: "src/shared.ts::shared:1",
      kind: "calls",
      provenance: {
        source: "tree-sitter",
        confidence: 0.8,
        evidence: "shared:2:35",
        content_hash: callerHash,
      },
      created_at: 1,
    });
    store.setFileHash("src/shared.ts", sharedHash);
    store.setFileHash("src/caller.ts", callerHash);

    const freshOutput = impact({
      symbols: ["shared"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 3,
    });
    const freshLines = freshOutput.trimEnd().split("\n");

    expect(freshLines[0]).toBe("## Trust");
    expect(freshLines[1]).toBe("status: fresh");
    expect(freshLines[2]).toBe("evidence: tree-sitter  stale-files: 0/2");
    expect(freshOutput).not.toContain("depth:1 [stale]");

    writeFileSync(join(projectRoot, "src", "caller.ts"), callerV2);

    const staleOutput = impact({
      symbols: ["shared"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 3,
    });
    const staleLines = staleOutput.trimEnd().split("\n");

    expect(staleLines[0]).toBe("## Trust");
    expect(staleLines[1]).toBe("status: stale");
    expect(staleLines[2]).toBe("evidence: tree-sitter  stale-files: 1/2");
    expect(staleOutput).toContain("depth:1 [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-impact-trust-header.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` with `Expected: "## Trust"` and `Received:` the first impact result line anchored to `src/caller.ts`

**Step 3 — Write minimal implementation**
```ts
import type { GraphStore, NeighborResult } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatImpactWhy, type NodeSignals, type SignalComputer } from "../output/signals.js";
import { prependTrustHeader } from "../output/trust.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";

export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";

export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
  signalComputer?: SignalComputer;
}
export interface ImpactItem {
  nodeId: string;
  name: string;
  file: string;
  depth: number;
  classification: ImpactClassification;
}

export interface ImpactDetail extends ImpactItem {
  chainConfidence: number;
  signals: NodeSignals;
}

interface QueueItem {
  id: string;
  depth: number;
  chainConfidence: number;
}

function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
  if (changeType === "addition") return null;
  if (changeType === "behavior_change") return "behavioral";
  if (changeType === "signature_change" || changeType === "removal") {
    return depth === 1 ? "breaking" : "behavioral";
  }
  return null;
}

function dedupeInboundByStrongestEdge(inbound: NeighborResult[]): NeighborResult[] {
  const bestByNode = new Map<string, NeighborResult>();
  for (const hit of inbound) {
    const existing = bestByNode.get(hit.node.id);
    if (!existing || hit.edge.provenance.confidence > existing.edge.provenance.confidence) {
      bestByNode.set(hit.node.id, hit);
    }
  }
  return [...bestByNode.values()];
}

function compareDetails(a: ImpactDetail, b: ImpactDetail): number {
  if (a.classification !== b.classification) return a.classification === "breaking" ? -1 : 1;
  if (a.signals.fanIn !== b.signals.fanIn) return b.signals.fanIn - a.signals.fanIn;
  if (a.signals.tested !== b.signals.tested) return a.signals.tested ? 1 : -1;
  if (a.signals.coChangeScore !== b.signals.coChangeScore) return b.signals.coChangeScore - a.signals.coChangeScore;
  if (a.chainConfidence !== b.chainConfidence) return b.chainConfidence - a.chainConfidence;
  if (a.depth !== b.depth) return a.depth - b.depth;
  return a.file.localeCompare(b.file) || a.name.localeCompare(b.name);
}

export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[] {
  const { symbols, changeType, store, maxDepth = 5, signalComputer: providedSignalComputer } = params;
  if (changeType === "addition") return [];

  const queue: QueueItem[] = [];
  const seen = new Map<string, { depth: number; chainConfidence: number }>();
  const detailsByNode = new Map<string, ImpactDetail>();

  const changedNodeIds: string[] = [];
  for (const symbol of symbols) {
    for (const node of store.findNodes(symbol)) {
      queue.push({ id: node.id, depth: 0, chainConfidence: 1 });
      seen.set(node.id, { depth: 0, chainConfidence: 1 });
      changedNodeIds.push(node.id);
    }
  }

  const signalComputer = providedSignalComputer ?? createSignalComputer(store);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inbound = dedupeInboundByStrongestEdge(store.getNeighbors(current.id, { direction: "in", kind: "calls" }));

    for (const neighbor of inbound) {
      const depth = current.depth + 1;
      const chainConfidence = Math.min(current.chainConfidence, neighbor.edge.provenance.confidence);
      const existing = seen.get(neighbor.node.id);

      if (existing && (existing.depth < depth || (existing.depth === depth && existing.chainConfidence >= chainConfidence))) {
        continue;
      }

      seen.set(neighbor.node.id, { depth, chainConfidence });
      queue.push({ id: neighbor.node.id, depth, chainConfidence });

      const classification = classify(changeType, depth);
      if (!classification) continue;

      detailsByNode.set(neighbor.node.id, {
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
        chainConfidence,
        signals: signalComputer.compute(neighbor.node.id, changedNodeIds),
      });
    }
  }

  return [...detailsByNode.values()].sort(compareDetails);
}

export function collectImpact(params: CollectImpactParams): ImpactItem[] {
  return collectImpactDetails(params).map(({ nodeId, name, file, depth, classification }) => ({
    nodeId,
    name,
    file,
    depth,
    classification,
  }));
}

export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  const stats = params.store.getStatistics(params.projectRoot);

  for (const symbol of params.symbols) {
    const resolved = resolveUniqueSymbol({
      name: symbol,
      store: params.store,
      projectRoot: params.projectRoot,
      notFoundLabel: "Symbol",
    });
    if (resolved.kind === "ambiguous") return prependTrustHeader(resolved.text, { stats });
    if (resolved.kind === "not_found") return prependTrustHeader("", { stats });
  }

  const signalComputer = createSignalComputer(params.store);
  const hits = collectImpactDetails({
    symbols: params.symbols,
    changeType: params.changeType,
    store: params.store,
    maxDepth: params.maxDepth,
    signalComputer,
  });

  if (hits.length === 0) return prependTrustHeader("", { stats });

  let hasLocalExceptions = false;
  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    if (stale) hasLocalExceptions = true;
    const why = formatImpactWhy(hit.signals, hit.chainConfidence);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}  ${why}`];
  });

  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
```

**Also in Step 3 — Update existing test assertions that break due to trust header**

In `test/extension-impact.test.ts`, inside the test `"impact() emits anchored structured lines and empty string for no-impact"`, replace:
```ts
    expect(out.trim().split("\n")).toHaveLength(1);
    expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:/);
    // AC 11 strict contract: file:line:hash + two-space field separators + trailing newline.
    expect(out).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]\n$/);
    const noImpact = impact({ symbols: ["shared"], changeType: "addition", store, projectRoot, maxDepth: 3 });
    expect(noImpact).toBe("");
```
with:
```ts
    expect(out).toContain("## Trust");
    expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:/);
    expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]\n/);
    const noImpact = impact({ symbols: ["shared"], changeType: "addition", store, projectRoot, maxDepth: 3 });
    expect(noImpact).toContain("## Trust");
    expect(noImpact).not.toContain("caller");
```

In `test/tool-impact-output-signals.test.ts`, inside the test `"impact appends always-on why annotations with chain confidence"`, replace:
```ts
    expect(out.trim().split("\n")).toHaveLength(1);
    expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0\.00, chain-confidence:0\.80\]$/);
```
with:
```ts
    expect(out).toContain("## Trust");
    expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0\.00, chain-confidence:0\.80\]/);
```

In `test/tool-impact-performance.test.ts`, inside the test `"impact renders 120 annotated dependents under one second"`, replace:
```ts
    const linesOut = output.trim().split("\n");
    expect(linesOut).toHaveLength(120);
    expect(linesOut.every((line) => line.includes("[fan-in:"))).toBe(true);
```
with:
```ts
    expect(output).toContain("## Trust");
    const linesOut = output.trim().split("\n");
    const resultLines = linesOut.filter((line) => line.includes("[fan-in:"));
    expect(resultLines).toHaveLength(120);
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-impact-trust-header.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
