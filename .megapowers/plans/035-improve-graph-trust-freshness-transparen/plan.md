# Plan

### Task 1: Add shared trust header formatter and status resolver

### Task 1: Add shared trust header formatter and status resolver

**Files:**
- Create: `src/output/trust.ts`
- Test: `test/output-trust-header.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import {
  collectEvidenceSources,
  formatTrustHeader,
  prependTrustHeader,
  resolveTrustStatus,
} from "../src/output/trust.js";

test("trust header uses a compact shared contract without indexed-at timestamps", () => {
  const stats = {
    nodes: {},
    edges: {
      calls: { "tree-sitter": 2, lsp: 1 },
      tested_by: { coverage: 1 },
    },
    files: { total: 4, stale: 0 },
  };

  expect(collectEvidenceSources(stats)).toEqual(["coverage", "lsp", "tree-sitter"]);
  expect(resolveTrustStatus({ stats })).toBe("fresh");
  expect(resolveTrustStatus({ stats: { ...stats, files: { total: 4, stale: 1 } } })).toBe("stale");
  expect(resolveTrustStatus({ stats, hasLocalExceptions: true })).toBe("mixed");
  expect(resolveTrustStatus({ stats, mode: "heuristic" })).toBe("heuristic");
  expect(resolveTrustStatus({ stats, mode: "runtime-backed" })).toBe("runtime-backed");

  expect(formatTrustHeader({ stats })).toBe([
    "## Trust",
    "status: fresh",
    "evidence: coverage,lsp,tree-sitter  stale-files: 0/4",
  ].join("\n"));

  expect(prependTrustHeader("rows: 0\n", { stats })).toBe([
    "## Trust",
    "status: fresh",
    "evidence: coverage,lsp,tree-sitter  stale-files: 0/4",
    "rows: 0",
    "",
  ].join("\n"));

  expect(formatTrustHeader({ stats })).not.toContain("indexed-at");
  expect(formatTrustHeader({ stats })).not.toContain("recency");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-trust-header.test.ts`
Expected: FAIL — `error: Cannot find module '../src/output/trust.js' from '/Users/maxwellnewman/pi/workspace/pi-codegraph/test/output-trust-header.test.ts'`

**Step 3 — Write minimal implementation**
```ts
import type { GraphStatistics } from "../graph/store.js";

export type TrustStatus = "fresh" | "stale" | "mixed" | "heuristic" | "runtime-backed";
export type TrustMode = "default" | "heuristic" | "runtime-backed";

export interface TrustHeaderContext {
  stats: GraphStatistics;
  mode?: TrustMode;
  hasLocalExceptions?: boolean;
}

export function collectEvidenceSources(stats: GraphStatistics): string[] {
  return Object.keys(stats.edges)
    .flatMap((kind) => Object.keys(stats.edges[kind] ?? {}))
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();
}

export function resolveTrustStatus(context: TrustHeaderContext): TrustStatus {
  const { stats, mode = "default", hasLocalExceptions = false } = context;
  const hasStaleFiles = stats.files.stale > 0;

  if (mode === "runtime-backed") {
    return hasStaleFiles || hasLocalExceptions ? "mixed" : "runtime-backed";
  }

  if (mode === "heuristic") {
    return hasStaleFiles || hasLocalExceptions ? "mixed" : "heuristic";
  }

  if (hasStaleFiles) return "stale";
  if (hasLocalExceptions) return "mixed";
  return "fresh";
}

export function formatTrustHeader(context: TrustHeaderContext): string {
  const status = resolveTrustStatus(context);
  const evidenceSources = collectEvidenceSources(context.stats);
  const evidence = evidenceSources.length > 0 ? evidenceSources.join(",") : "none";

  return [
    "## Trust",
    `status: ${status}`,
    `evidence: ${evidence}  stale-files: ${context.stats.files.stale}/${context.stats.files.total}`,
  ].join("\n");
}

export function prependTrustHeader(body: string, context: TrustHeaderContext): string {
  return `${formatTrustHeader(context)}\n${body}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-trust-header.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: Prepend trust header to symbol_graph [depends: 1]

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

### Task 3: Prepend trust header to impact [depends: 1]

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

### Task 4: Prepend trust header to coverage-backed trace output [depends: 1]

### Task 4: Prepend trust header to coverage-backed trace output [depends: 1]

**Files:**
- Modify: `src/tools/trace.ts`
- Modify: `test/tool-trace-signals.test.ts` (update assertions for trust header)
- Test: `test/tool-trace-trust-runtime.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

test("trace prepends a runtime-backed trust header and degrades to mixed when a stored coverage step goes stale", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-trust-runtime-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const appV1 = "export function prod() { return helper(); }\nexport function helper() { return 1; }\n";
  const appV2 = "export function prod() { return helper() + 1; }\nexport function helper() { return 1; }\n";
  const testContent = "export function prodTest() { return prod(); }\n";

  writeFileSync(join(projectRoot, "src", "app.ts"), appV1);
  writeFileSync(join(projectRoot, "test", "app.test.ts"), testContent);

  const appHash = sha256Hex(appV1);
  const testHash = sha256Hex(testContent);
  const store = new SqliteGraphStore();

  try {
    const testNode = { id: "test/app.test.ts::prodTest:1", kind: "test" as const, name: "prodTest", file: "test/app.test.ts", start_line: 1, end_line: 1, content_hash: testHash, is_exported: false };
    const prod = { id: "src/app.ts::prod:1", kind: "function" as const, name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: appHash, is_exported: true };
    const helper = { id: "src/app.ts::helper:2", kind: "function" as const, name: "helper", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: appHash, is_exported: false };

    store.addNode(testNode);
    store.addNode(prod);
    store.addNode(helper);
    store.addEdge({
      source: prod.id,
      target: helper.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "helper", content_hash: appHash },
      created_at: 1,
    });
    store.addEdge({
      source: prod.id,
      target: testNode.id,
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 1, evidence: "v8", content_hash: appHash },
      created_at: 2,
    });
    store.saveTestTrace({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: testHash },
        { nodeId: prod.id, ordinal: 1, contentHash: appHash },
        { nodeId: helper.id, ordinal: 2, contentHash: appHash },
      ],
    });
    store.setFileHash("src/app.ts", appHash);
    store.setFileHash("test/app.test.ts", testHash);

    const freshOutput = trace({ entry: "prod", file: "src/app.ts", store, projectRoot });
    const freshLines = freshOutput.trimEnd().split("\n");

    expect(freshLines[0]).toBe("## Trust");
    expect(freshLines[1]).toBe("status: runtime-backed");
    expect(freshLines[2]).toBe("evidence: coverage,tree-sitter  stale-files: 0/2");
    expect(freshLines[3]).toBe("mode: coverage");
    expect(freshOutput).not.toContain("function [stale]");

    writeFileSync(join(projectRoot, "src", "app.ts"), appV2);

    const mixedOutput = trace({ entry: "prod", file: "src/app.ts", store, projectRoot });
    const mixedLines = mixedOutput.trimEnd().split("\n");

    expect(mixedLines[0]).toBe("## Trust");
    expect(mixedLines[1]).toBe("status: mixed");
    expect(mixedLines[2]).toBe("evidence: coverage,tree-sitter  stale-files: 1/2");
    expect(mixedLines[3]).toBe("mode: coverage [stale]");
    expect(mixedOutput).toContain("prod  function [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-trust-runtime.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` with `Expected: "## Trust"` and `Received: "mode: coverage"`

**Step 3 — Write minimal implementation**
```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatRoleTags, type SignalComputer } from "../output/signals.js";
import { prependTrustHeader } from "../output/trust.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";

export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}

function pickCoverageTraceForNode(store: GraphStore, nodeId: string): string | null {
  const coveringTests = store.getNeighbors(nodeId, { direction: "out", kind: "tested_by" }).sort((a, b) => a.node.id.localeCompare(b.node.id));
  for (const candidate of coveringTests) {
    const record = store.getTestTrace(candidate.node.id);
    if (record) return record.testNodeId;
  }
  return null;
}

function resolveCoverageTraceId(store: GraphStore, nodeId: string): string | null {
  const node = store.getNode(nodeId);
  if (!node) return null;
  if (node.kind === "test") return node.id;
  if (node.kind === "endpoint") {
    const handlers = store.getNeighbors(node.id, { direction: "in", kind: "routes_to" }).sort((a, b) => a.node.id.localeCompare(b.node.id));
    for (const handler of handlers) {
      const traceId = pickCoverageTraceForNode(store, handler.node.id);
      if (traceId) return traceId;
    }
    return null;
  }
  return pickCoverageTraceForNode(store, node.id);
}

function buildStaticTrace(store: GraphStore, startNodeId: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = startNodeId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    ordered.push(currentId);
    const nextNeighbors = store.getNeighbors(currentId, { direction: "out", kind: "calls" });
    const next = nextNeighbors.sort((a, b) => a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || a.node.id.localeCompare(b.node.id))[0];
    currentId = next?.node.id ?? null;
  }

  return ordered;
}

function formatStoredTraceLine(
  store: GraphStore,
  nodeId: string,
  storedHash: string,
  projectRoot: string,
  signalComputer: SignalComputer,
): { line: string; stale: boolean } {
  const node = store.getNode(nodeId);
  if (!node) {
    return { line: `${nodeId}  unresolved [stale]`, stale: true };
  }
  const anchor = computeAnchor(node, projectRoot);
  const stale = anchor.stale || node.content_hash !== storedHash;
  const tags = formatRoleTags(signalComputer.compute(node.id));
  return {
    line: `${anchor.anchor}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""} ${tags}`,
    stale,
  };
}

function formatLiveTraceLine(
  store: GraphStore,
  nodeId: string,
  projectRoot: string,
  signalComputer: SignalComputer,
): string {
  const node = store.getNode(nodeId);
  if (!node) return `${nodeId}  unresolved [stale]`;
  const anchor = computeAnchor(node, projectRoot);
  const tags = formatRoleTags(signalComputer.compute(node.id));
  return `${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""} ${tags}`;
}

function formatModeHeader(mode: "coverage" | "static", stale = false): string {
  const base = mode === "coverage" ? "mode: coverage" : "mode: static (heuristic, no runtime evidence)";
  return `${base}${stale ? " [stale]" : ""}`;
}

export function trace(params: TraceParams): string {
  const resolved = resolveUniqueSymbol({
    name: params.entry,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
    notFoundLabel: "Entry",
  });

  const stats = params.store.getStatistics(params.projectRoot);
  if (resolved.kind === "not_found" || resolved.kind === "ambiguous") {
    return prependTrustHeader(resolved.text, { stats });
  }

  const node = resolved.node;
  const signalComputer = createSignalComputer(params.store);
  const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const rendered = coverage.steps
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((step) => formatStoredTraceLine(params.store, step.nodeId, step.contentHash, params.projectRoot, signalComputer));
      const traceStale = rendered.some((item) => item.stale);
      const body = `${[formatModeHeader("coverage", traceStale), ...rendered.map((item) => item.line)].join("\n")}\n`;
      return prependTrustHeader(body, {
        stats,
        mode: "runtime-backed",
        hasLocalExceptions: traceStale,
      });
    }
  }

  const staticSteps = buildStaticTrace(params.store, node.id);
  return `${[formatModeHeader("static"), ...staticSteps.map((step) => formatLiveTraceLine(params.store, step, params.projectRoot, signalComputer))].join("\n")}\n`;
}
```

**Also in Step 3 — Update existing test assertions that break due to trust header**

In `test/tool-trace-signals.test.ts`, inside the test `"trace appends inline role tags to coverage and static step lines without changing mode header"`, replace:
```ts
    expect(lines[0]).toBe("mode: coverage [stale]");
```
with:
```ts
    expect(lines[0]).toBe("## Trust");
    expect(lines[3]).toBe("mode: coverage [stale]");
```

The existing `.some()` regex checks on subsequent lines are already index-agnostic and survive as-is.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-trust-runtime.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Prepend trust header to heuristic trace output [depends: 1, 4]

### Task 5: Prepend trust header to heuristic trace output [depends: 1, 4]

**Files:**
- Modify: `src/tools/trace.ts`
- Modify: `test/tool-trace-static-mode-header.test.ts` (update assertions for trust header)
- Test: `test/tool-trace-trust-heuristic.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

test("trace prepends the shared trust header for static heuristic paths without changing mode semantics", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-trust-heuristic-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const content = "export function entry() { return first(); }\nexport function first() { return second(); }\nexport function second() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), content);

  const fileHash = sha256Hex(content);
  const store = new SqliteGraphStore();

  try {
    const entry = { id: "src/app.ts::entry:1", kind: "function" as const, name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: fileHash, is_exported: true };
    const first = { id: "src/app.ts::first:2", kind: "function" as const, name: "first", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: fileHash, is_exported: false };
    const second = { id: "src/app.ts::second:3", kind: "function" as const, name: "second", file: "src/app.ts", start_line: 3, end_line: 3, content_hash: fileHash, is_exported: false };

    store.addNode(entry);
    store.addNode(first);
    store.addNode(second);
    store.addEdge({
      source: entry.id,
      target: first.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "first", content_hash: fileHash },
      created_at: 1,
    });
    store.addEdge({
      source: first.id,
      target: second.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "second", content_hash: fileHash },
      created_at: 2,
    });
    store.setFileHash("src/app.ts", fileHash);

    const output = trace({ entry: "entry", file: "src/app.ts", store, projectRoot });
    const lines = output.trimEnd().split("\n");

    expect(lines[0]).toBe("## Trust");
    expect(lines[1]).toBe("status: heuristic");
    expect(lines[2]).toBe("evidence: tree-sitter  stale-files: 0/1");
    expect(lines[3]).toBe("mode: static (heuristic, no runtime evidence)");
    expect(lines[4]).toContain("src/app.ts:1:");
    expect(lines[4]).toContain("entry  function");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-trust-heuristic.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` with `Expected: "## Trust"` and `Received: "mode: static (heuristic, no runtime evidence)"`

**Step 3 — Write minimal implementation**
```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatRoleTags, type SignalComputer } from "../output/signals.js";
import { prependTrustHeader } from "../output/trust.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";

export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}

function pickCoverageTraceForNode(store: GraphStore, nodeId: string): string | null {
  const coveringTests = store.getNeighbors(nodeId, { direction: "out", kind: "tested_by" }).sort((a, b) => a.node.id.localeCompare(b.node.id));
  for (const candidate of coveringTests) {
    const record = store.getTestTrace(candidate.node.id);
    if (record) return record.testNodeId;
  }
  return null;
}

function resolveCoverageTraceId(store: GraphStore, nodeId: string): string | null {
  const node = store.getNode(nodeId);
  if (!node) return null;
  if (node.kind === "test") return node.id;
  if (node.kind === "endpoint") {
    const handlers = store.getNeighbors(node.id, { direction: "in", kind: "routes_to" }).sort((a, b) => a.node.id.localeCompare(b.node.id));
    for (const handler of handlers) {
      const traceId = pickCoverageTraceForNode(store, handler.node.id);
      if (traceId) return traceId;
    }
    return null;
  }
  return pickCoverageTraceForNode(store, node.id);
}

function buildStaticTrace(store: GraphStore, startNodeId: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = startNodeId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    ordered.push(currentId);
    const nextNeighbors = store.getNeighbors(currentId, { direction: "out", kind: "calls" });
    const next = nextNeighbors.sort((a, b) => a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || a.node.id.localeCompare(b.node.id))[0];
    currentId = next?.node.id ?? null;
  }

  return ordered;
}

function formatStoredTraceLine(
  store: GraphStore,
  nodeId: string,
  storedHash: string,
  projectRoot: string,
  signalComputer: SignalComputer,
): { line: string; stale: boolean } {
  const node = store.getNode(nodeId);
  if (!node) {
    return { line: `${nodeId}  unresolved [stale]`, stale: true };
  }
  const anchor = computeAnchor(node, projectRoot);
  const stale = anchor.stale || node.content_hash !== storedHash;
  const tags = formatRoleTags(signalComputer.compute(node.id));
  return {
    line: `${anchor.anchor}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""} ${tags}`,
    stale,
  };
}

function formatLiveTraceLine(
  store: GraphStore,
  nodeId: string,
  projectRoot: string,
  signalComputer: SignalComputer,
): { line: string; stale: boolean } {
  const node = store.getNode(nodeId);
  if (!node) return { line: `${nodeId}  unresolved [stale]`, stale: true };
  const anchor = computeAnchor(node, projectRoot);
  const tags = formatRoleTags(signalComputer.compute(node.id));
  return {
    line: `${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""} ${tags}`,
    stale: anchor.stale,
  };
}

function formatModeHeader(mode: "coverage" | "static", stale = false): string {
  const base = mode === "coverage" ? "mode: coverage" : "mode: static (heuristic, no runtime evidence)";
  return `${base}${stale ? " [stale]" : ""}`;
}

export function trace(params: TraceParams): string {
  const resolved = resolveUniqueSymbol({
    name: params.entry,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
    notFoundLabel: "Entry",
  });

  const stats = params.store.getStatistics(params.projectRoot);
  if (resolved.kind === "not_found" || resolved.kind === "ambiguous") {
    return prependTrustHeader(resolved.text, { stats });
  }

  const node = resolved.node;
  const signalComputer = createSignalComputer(params.store);
  const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const rendered = coverage.steps
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((step) => formatStoredTraceLine(params.store, step.nodeId, step.contentHash, params.projectRoot, signalComputer));
      const traceStale = rendered.some((item) => item.stale);
      const body = `${[formatModeHeader("coverage", traceStale), ...rendered.map((item) => item.line)].join("\n")}\n`;
      return prependTrustHeader(body, { stats, mode: "runtime-backed", hasLocalExceptions: traceStale });
    }
  }

  const staticSteps = buildStaticTrace(params.store, node.id)
    .map((step) => formatLiveTraceLine(params.store, step, params.projectRoot, signalComputer));
  const staticStale = staticSteps.some((step) => step.stale);
  const body = `${[formatModeHeader("static", staticStale), ...staticSteps.map((step) => step.line)].join("\n")}\n`;
  return prependTrustHeader(body, { stats, mode: "heuristic", hasLocalExceptions: staticStale });
}
```

**Also in Step 3 — Update existing test assertions that break due to trust header**

In `test/tool-trace-static-mode-header.test.ts`, inside the test `"trace marks static fallback paths as heuristic without changing step lines"`, replace:
```ts
    expect(lines[0]).toBe("mode: static (heuristic, no runtime evidence)");
    expect(lines[1]).toContain("src/app.ts:1:");
    expect(lines[1]).toContain("entry  function");
    expect(lines).toHaveLength(4);
```
with:
```ts
    expect(lines[0]).toBe("## Trust");
    expect(lines[1]).toBe("status: heuristic");
    expect(lines[3]).toBe("mode: static (heuristic, no runtime evidence)");
    expect(lines[4]).toContain("src/app.ts:1:");
    expect(lines[4]).toContain("entry  function");
    expect(lines).toHaveLength(7);
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-trust-heuristic.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: Prepend trust header to graph_query [depends: 1]

### Task 6: Prepend trust header to graph_query [depends: 1]

**Files:**
- Modify: `src/tools/graph-query.ts`
- Modify: `src/tools/graph-query-render.ts`
- Modify: `test/tool-graph-query-empty-query.test.ts` (update assertion for trust header)
- Modify: `test/tool-graph-query-execution-error.test.ts` (add `getStatistics` to fakeStore, update assertion)
- Test: `test/tool-graph-query-trust-header.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery prepends the shared trust header and keeps stale node markers local", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-trust-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const content = "export function hello() { return 'world'; }\n";
  writeFileSync(join(projectRoot, "src", "hello.ts"), content);

  const freshHash = sha256Hex(content);
  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/hello.ts::hello:1",
      kind: "function",
      name: "hello",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: freshHash,
      is_exported: true,
    });

    const freshOutput = graphQuery({
      query: 'MATCH (a {name: "hello"}) RETURN a',
      store,
      projectRoot,
    });
    const freshLines = freshOutput.trimEnd().split("\n");

    expect(freshLines[0]).toBe("## Trust");
    expect(freshLines[1]).toBe("status: fresh");
    expect(freshLines[2]).toBe("evidence: none  stale-files: 0/0");
    expect(freshLines[3]).toBe("rows: 1");
    expect(freshOutput).not.toContain("[stale]");

    store.addNode({
      id: "src/hello.ts::hello:1",
      kind: "function",
      name: "hello",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "stale-hash",
      is_exported: true,
    });

    const mixedOutput = graphQuery({
      query: 'MATCH (a {name: "hello"}) RETURN a',
      store,
      projectRoot,
    });
    const mixedLines = mixedOutput.trimEnd().split("\n");

    expect(mixedLines[0]).toBe("## Trust");
    expect(mixedLines[1]).toBe("status: mixed");
    expect(mixedLines[2]).toBe("evidence: none  stale-files: 0/0");
    expect(mixedOutput).toContain("a: src/hello.ts:1:");
    expect(mixedOutput).toContain("function [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-trust-header.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` with `Expected: "## Trust"` and `Received: "rows: 1"`

**Step 3 — Write minimal implementation**
```ts
// src/tools/graph-query-render.ts
import { computeAnchor } from "../output/anchoring.js";
import type { GraphNode } from "../graph/types.js";
import type { CompiledColumn } from "./graph-query-compiler.js";

interface GraphNodeRow {
  id: string;
  kind: GraphNode["kind"];
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
}

export interface GraphQueryRenderResult {
  text: string;
  hasLocalExceptions: boolean;
}

function readNode(row: Record<string, unknown>, prefix: string): GraphNodeRow {
  return {
    id: String(row[`${prefix}__id`]),
    kind: row[`${prefix}__kind`] as GraphNode["kind"],
    name: String(row[`${prefix}__name`]),
    file: String(row[`${prefix}__file`]),
    start_line: Number(row[`${prefix}__start_line`]),
    end_line: row[`${prefix}__end_line`] == null ? null : Number(row[`${prefix}__end_line`]),
    content_hash: String(row[`${prefix}__content_hash`]),
  };
}

export function renderGraphQueryResult(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): GraphQueryRenderResult {
  if (rows.length === 0) {
    return { text: "rows: 0\n", hasLocalExceptions: false };
  }

  let hasLocalExceptions = false;
  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind === "node") {
        const node = readNode(row, column.sqlAliasPrefix);
        const anchor = computeAnchor(node, projectRoot);
        if (anchor.stale) hasLocalExceptions = true;
        lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}`);
        continue;
      }
      if (column.kind === "edge") {
        lines.push(`  ${column.key}: ${String(row[`${column.sqlAliasPrefix}__kind`])}  source:${String(row[`${column.sqlAliasPrefix}__source`])}  target:${String(row[`${column.sqlAliasPrefix}__target`])}  provenance:${String(row[`${column.sqlAliasPrefix}__provenance_source`])}  confidence:${String(row[`${column.sqlAliasPrefix}__confidence`])}  evidence:${String(row[`${column.sqlAliasPrefix}__evidence`])}`);
        continue;
      }
      if (column.kind === "scalar") {
        lines.push(`  ${column.key}: ${String(row[column.sqlAlias])}`);
      }
    }
  });

  return { text: `${lines.join("\n")}\n`, hasLocalExceptions };
}

export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  return renderGraphQueryResult(rows, columns, projectRoot).text;
}
```

```ts
// src/tools/graph-query.ts
import type { GraphStore } from "../graph/store.js";
import { prependTrustHeader } from "../output/trust.js";
import { compileGraphQuery } from "./graph-query-compiler.js";
import { GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
import { renderGraphQueryResult } from "./graph-query-render.js";

export interface GraphQueryParams {
  query: string;
  store: GraphStore;
  projectRoot: string;
}

export function graphQuery(params: GraphQueryParams): string {
  const stats = params.store.getStatistics(params.projectRoot);

  try {
    if (params.query.trim().length === 0) {
      return prependTrustHeader("parse_error: query must not be empty\n", { stats });
    }

    const ast = parseGraphQuery(params.query);
    const compiled = compileGraphQuery(ast);

    try {
      const rows = params.store.queryRows<Record<string, unknown>>(compiled.sql, compiled.params);
      const rendered = renderGraphQueryResult(rows, compiled.columns, params.projectRoot);
      return prependTrustHeader(rendered.text, {
        stats,
        hasLocalExceptions: rendered.hasLocalExceptions,
      });
    } catch {
      return prependTrustHeader("execution_error: failed to execute compiled query\n", { stats });
    }
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return prependTrustHeader(`${error.kind}: ${error.message}\n`, { stats });
    }
    throw error;
  }
}
```

**Also in Step 3 — Update existing test assertions that break due to trust header**

In `test/tool-graph-query-empty-query.test.ts`, replace the full test body:
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery rejects blank query strings with parse_error", () => {
  const store = new SqliteGraphStore();
  try {
    const output = graphQuery({
      query: "   \n\t  ",
      store,
      projectRoot: "/tmp/project",
    });

    expect(output).toContain("## Trust");
    expect(output).toContain("parse_error: query must not be empty");
  } finally {
    store.close();
  }
});
```

In `test/tool-graph-query-execution-error.test.ts`, replace the full test body (adds `getStatistics` to fakeStore and relaxes assertion):
```ts
import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery converts store execution failures into execution_error output", () => {
  const fakeStore = {
    queryRows() {
      throw new Error("sqlite busy");
    },
    getStatistics() {
      return { nodes: {}, edges: {}, files: { total: 0, stale: 0 } };
    },
  } as any;

  const output = graphQuery({
    query: 'MATCH (a {name: "hello"}) RETURN a',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain("## Trust");
  expect(output).toContain("execution_error: failed to execute compiled query");
});
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-trust-header.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
