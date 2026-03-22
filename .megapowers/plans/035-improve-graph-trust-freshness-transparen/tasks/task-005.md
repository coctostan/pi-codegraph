---
id: 5
title: Prepend trust header to heuristic trace output
status: approved
depends_on:
  - 1
  - 4
no_test: false
files_to_modify:
  - src/tools/trace.ts
  - test/tool-trace-static-mode-header.test.ts
files_to_create:
  - test/tool-trace-trust-heuristic.test.ts
---

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
