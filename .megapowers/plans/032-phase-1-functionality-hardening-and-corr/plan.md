# Plan

### Task 1: Refresh stale persisted graph before serving tool results

### Task 1: Refresh stale persisted graph before serving tool results (covers AC 1 and AC 2 by re-running indexing before serving `symbol_graph` from a persisted stale DB)
**Files:**
- Create: `test/extension-stale-db-refresh.test.ts`
- Modify: `src/index.ts`
- Test: `test/extension-stale-db-refresh.test.ts`
**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extension refreshes a persisted stale graph before symbol_graph responds", async () => {
  const fixtureRoot = join(tmpdir(), `pi-cg-stale-refresh-${Date.now()}`);
  mkdirSync(fixtureRoot, { recursive: true });
  cpSync(join(process.cwd(), "src"), join(fixtureRoot, "src"), { recursive: true });
  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    let symbolGraphExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") symbolGraphExecute = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const ctx = { cwd: fixtureRoot };
    await symbolGraphExecute!("initial-sg", { name: "GraphStore", file: "src/graph/store.ts" }, undefined, undefined, ctx);
    const storePath = join(fixtureRoot, "src/graph/store.ts");
    writeFileSync(storePath, `// shift 1\n// shift 2\n// shift 3\n${readFileSync(storePath, "utf8")}`);
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    mod.default(mockPi as any);
    const symbolGraphResult = await symbolGraphExecute!(
      "stale-sg",
      { name: "GraphStore", file: "src/graph/store.ts" },
      undefined,
      undefined,
      ctx,
    );
    const symbolGraphText = symbolGraphResult.content[0]?.text ?? "";
    expect(symbolGraphText).toContain("src/graph/store.ts:33:");
    expect(symbolGraphText).not.toContain("[stale]");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-stale-db-refresh.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because the stale-db run still returns the old GraphStore anchor such as `src/graph/store.ts:30:` with a `[stale]` marker instead of the refreshed `src/graph/store.ts:33:` anchor.

**Step 3 — Write minimal implementation**
Replace `ensureIndexed()` in `src/index.ts` with the incremental-refresh version below. This fix relies on `indexProject()` already being incremental: unchanged files are skipped, while changed, removed, and newly added files are reconciled before any tool response is returned.
```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  await indexProject(projectRoot, store);
  }
```
**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-stale-db-refresh.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: Make trace report ambiguous symbol matches explicitly

### Task 2: Make trace report ambiguous symbol matches explicitly

**Files:**
- Create: `src/tools/symbol-resolution.ts`
- Create: `test/tool-trace-ambiguous.test.ts`
- Modify: `src/tools/trace.ts`
- Test: `test/tool-trace-ambiguous.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("trace returns a disambiguation list when entry matches multiple symbols", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-ambiguous-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const prodContent = "export function sha256Hex() { return 'prod'; }\n";
  const helperContent = "export function sha256Hex() { return 'helper'; }\n";
  writeFileSync(join(projectRoot, "src", "hash.ts"), prodContent);
  writeFileSync(join(projectRoot, "test", "hash.test.ts"), helperContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/hash.ts::sha256Hex:1",
      kind: "function",
      name: "sha256Hex",
      file: "src/hash.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(prodContent),
    });
    store.addNode({
      id: "test/hash.test.ts::sha256Hex:1",
      kind: "function",
      name: "sha256Hex",
      file: "test/hash.test.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(helperContent),
    });

    const output = trace({ entry: "sha256Hex", store, projectRoot });

    expect(output).toContain('Multiple matches for "sha256Hex"');
    expect(output).toContain("src/hash.ts:1:");
    expect(output).toContain("test/hash.test.ts:1:");
    expect(output).not.toContain('Entry "sha256Hex" not found');
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-ambiguous.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because `trace()` currently returns `Entry "sha256Hex" not found` instead of a disambiguation list.

**Step 3 — Write minimal implementation**
Create `src/tools/symbol-resolution.ts` with:

```ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
import { computeAnchor } from "../output/anchoring.js";

export type SymbolResolution =
  | { kind: "not_found"; text: string }
  | { kind: "ambiguous"; text: string }
  | { kind: "unique"; node: GraphNode };

export function formatAmbiguousMatches(name: string, nodes: GraphNode[], projectRoot: string): string {
  const lines: string[] = [`Multiple matches for "${name}":`, ""];
  for (const node of nodes) {
    const anchor = computeAnchor(node, projectRoot);
    const staleMarker = anchor.stale ? " [stale]" : "";
    lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
  }
  return `${lines.join("\n")}\n`;
}

export function resolveUniqueSymbol(params: {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
  notFoundLabel: string;
}): SymbolResolution {
  const nodes = params.store.findNodes(params.name, params.file);
  if (nodes.length === 0) {
    return { kind: "not_found", text: `${params.notFoundLabel} "${params.name}" not found` };
  }
  if (nodes.length > 1) {
    return { kind: "ambiguous", text: formatAmbiguousMatches(params.name, nodes, params.projectRoot) };
  }
  return { kind: "unique", node: nodes[0]! };
}
```

Replace `src/tools/trace.ts` with:

```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
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
    const next = nextNeighbors
      .sort((a, b) => a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || a.node.id.localeCompare(b.node.id))[0];
    currentId = next?.node.id ?? null;
  }

  return ordered;
}

function formatStoredTraceLine(store: GraphStore, nodeId: string, storedHash: string, projectRoot: string): { line: string; stale: boolean } {
  const node = store.getNode(nodeId);
  if (!node) {
    return { line: `${nodeId}  unresolved [stale]`, stale: true };
  }
  const anchor = computeAnchor(node, projectRoot);
  const stale = anchor.stale || node.content_hash !== storedHash;
  return {
    line: `${anchor.anchor}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""}`,
    stale,
  };
}

function formatLiveTraceLine(store: GraphStore, nodeId: string, projectRoot: string): string {
  const node = store.getNode(nodeId);
  if (!node) return `${nodeId}  unresolved [stale]`;
  const anchor = computeAnchor(node, projectRoot);
  return `${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}`;
}

export function trace(params: TraceParams): string {
  const resolved = resolveUniqueSymbol({
    name: params.entry,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
    notFoundLabel: "Entry",
  });
  if (resolved.kind === "not_found" || resolved.kind === "ambiguous") return resolved.text;

  const node = resolved.node;
  const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const rendered = coverage.steps.sort((a, b) => a.ordinal - b.ordinal).map((step) => formatStoredTraceLine(params.store, step.nodeId, step.contentHash, params.projectRoot));
      const traceStale = rendered.some((item) => item.stale);
      return `${[`mode: coverage${traceStale ? " [stale]" : ""}`, ...rendered.map((item) => item.line)].join("\n")}\n`;
    }
  }

  const staticSteps = buildStaticTrace(params.store, node.id);
  return `${["mode: static", ...staticSteps.map((step) => formatLiveTraceLine(params.store, step, params.projectRoot))].join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-ambiguous.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Make impact reject ambiguous symbol seeds [depends: 2]

### Task 3: Make impact reject ambiguous symbol seeds [depends: 2]

**Files:**
- Create: `test/tool-impact-ambiguous.test.ts`
- Modify: `src/tools/impact.ts`
- Test: `test/tool-impact-ambiguous.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("impact returns a disambiguation list instead of aggregating all ambiguous symbol matches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-ambiguous-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const prodContent = "export function sha256Hex() { return 'prod'; }\n";
  const helperContent = "export function sha256Hex() { return 'helper'; }\n";
  const callerContent = "export function caller() { return sha256Hex(); }\n";
  writeFileSync(join(projectRoot, "src", "hash.ts"), prodContent);
  writeFileSync(join(projectRoot, "test", "hash.test.ts"), helperContent);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerContent);

  const store = new SqliteGraphStore();
  try {
    const prodNode = {
      id: "src/hash.ts::sha256Hex:1",
      kind: "function" as const,
      name: "sha256Hex",
      file: "src/hash.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(prodContent),
    };
    const testNode = {
      id: "test/hash.test.ts::sha256Hex:1",
      kind: "function" as const,
      name: "sha256Hex",
      file: "test/hash.test.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(helperContent),
    };
    const callerNode = {
      id: "src/caller.ts::caller:1",
      kind: "function" as const,
      name: "caller",
      file: "src/caller.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(callerContent),
    };

    store.addNode(prodNode);
    store.addNode(testNode);
    store.addNode(callerNode);
    store.addEdge({
      source: callerNode.id,
      target: prodNode.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "sha256Hex", content_hash: sha256Hex(callerContent) },
      created_at: 1,
    });

    const output = impact({
      symbols: ["sha256Hex"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 3,
    });

    expect(output).toContain('Multiple matches for "sha256Hex"');
    expect(output).toContain("src/hash.ts:1:");
    expect(output).toContain("test/hash.test.ts:1:");
    expect(output).not.toContain("caller  breaking  depth:1");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-impact-ambiguous.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because `impact()` currently returns blended impact output like `caller  breaking  depth:1` instead of an ambiguity/disambiguation message.

**Step 3 — Write minimal implementation**
Replace `src/tools/impact.ts` with the version below. Keep `collectImpact()` on its existing `symbols: string[]` contract because it is already part of the tested surface in `test/tool-impact.test.ts`; this task only changes the user-facing ambiguity semantics of `impact()`.
```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";
export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";
export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
}
export interface ImpactItem {
  nodeId: string;
  name: string;
  file: string;
  depth: number;
  classification: ImpactClassification;
}
function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
  if (changeType === "addition") return null;
  if (changeType === "behavior_change") return "behavioral";
  if (changeType === "signature_change" || changeType === "removal") {
    return depth === 1 ? "breaking" : "behavioral";
  }
  return null;
}
export function collectImpact(params: CollectImpactParams): ImpactItem[] {
  const { symbols, changeType, store, maxDepth = 5 } = params;
  if (changeType === "addition") return [];

  const queue: Array<{ id: string; depth: number }> = [];
  const seen = new Set<string>();
  const results: ImpactItem[] = [];

  for (const symbol of symbols) {
    for (const node of store.findNodes(symbol)) {
      queue.push({ id: node.id, depth: 0 });
      seen.add(node.id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inbound = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
    for (const neighbor of inbound) {
      if (seen.has(neighbor.node.id)) continue;
      const depth = current.depth + 1;
      seen.add(neighbor.node.id);
      queue.push({ id: neighbor.node.id, depth });
      const classification = classify(changeType, depth);
      if (!classification) continue;
      results.push({
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
      });
    }
  }

  return results.sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  for (const symbol of params.symbols) {
    const resolved = resolveUniqueSymbol({
      name: symbol,
      store: params.store,
      projectRoot: params.projectRoot,
      notFoundLabel: "Symbol",
    });
    if (resolved.kind === "ambiguous") return resolved.text;
    if (resolved.kind === "not_found") return "";
  }

  const hits = collectImpact({
    symbols: params.symbols,
    changeType: params.changeType,
    store: params.store,
    maxDepth: params.maxDepth,
  });
  if (hits.length === 0) return "";

  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}`];
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-impact-ambiguous.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Accept single-quoted WHERE string literals in graph_query

### Task 4: Accept single-quoted WHERE string literals in graph_query

**Files:**
- Create: `test/tool-graph-query-single-quote-where.test.ts`
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/tool-graph-query-single-quote-where.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery accepts a single-quoted equality predicate in WHERE", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-single-quote-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const graphStoreContent = "export interface GraphStore {}\n";
  writeFileSync(join(projectRoot, "src", "graph-store.ts"), graphStoreContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/graph-store.ts::GraphStore:1",
      kind: "interface",
      name: "GraphStore",
      file: "src/graph-store.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(graphStoreContent),
    });

    const output = graphQuery({
      query: "MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name",
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("n.name: GraphStore");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-single-quote-where.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because the current parser returns `parse_error: invalid WHERE predicate: n.name = 'GraphStore'`.

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-parser.ts`, replace `parseWhere()` with:

```ts
function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];

  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError("unsupported_error", "OR is not supported");
  }

  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece
      .trim()
      .match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]+)"|'([^']+)')$/);
    if (!match) throw new GraphQueryError("parse_error", `invalid WHERE predicate: ${piece.trim()}`);
    return {
      alias: match[1]!,
      property: match[2]!,
      value: match[3] ?? match[4]!,
    };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-single-quote-where.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
