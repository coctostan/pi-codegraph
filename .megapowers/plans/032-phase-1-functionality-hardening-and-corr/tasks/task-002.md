---
id: 2
title: Make trace report ambiguous symbol matches explicitly
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/trace.ts
files_to_create:
  - src/tools/symbol-resolution.ts
  - test/tool-trace-ambiguous.test.ts
---

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
