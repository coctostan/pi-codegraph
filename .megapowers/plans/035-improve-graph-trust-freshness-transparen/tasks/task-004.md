---
id: 4
title: Prepend trust header to coverage-backed trace output
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/trace.ts
  - test/tool-trace-signals.test.ts
files_to_create:
  - test/tool-trace-trust-runtime.test.ts
---

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
