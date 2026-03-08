---
id: 8
title: Mark stale and unresolved trace steps without failing the trace
status: approved
depends_on:
  - 3
  - 6
  - 7
no_test: false
files_to_modify:
  - src/tools/trace.ts
files_to_create:
  - test/tool-trace-stale.test.ts
---

### Task 8: Mark stale and unresolved trace steps without failing the trace [depends: 3, 6, 7]
- Modify: `src/tools/trace.ts`
- Create: `test/tool-trace-stale.test.ts`
**ACs covered:** 16, 18
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";
test("trace marks stale and unresolved stored steps without failing the whole trace", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function prod() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "app.test.ts"), "export function prodTest() { return prod(); }\n");
  const store = new SqliteGraphStore();
  try {
    const prod = { id: "src/app.ts::prod:1", kind: "function" as const, name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "old-app-hash" };
    const testNode = { id: "src/app.test.ts::prodTest:1", kind: "test" as const, name: "prodTest", file: "src/app.test.ts", start_line: 1, end_line: 1, content_hash: "old-test-hash" };
    store.addNode(testNode);
    store.addEdge({ source: prod.id, target: testNode.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "prod", content_hash: "old-app-hash" }, created_at: 1 });
    store.saveTestTrace({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: "old-test-hash" },
        { nodeId: prod.id, ordinal: 1, contentHash: "old-app-hash" },
        { nodeId: "src/app.ts::removed:9", ordinal: 2, contentHash: "old-removed-hash" },
      ],
    });
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store, projectRoot });
    expect(output).toContain("mode: coverage [stale]");
    expect(output).toContain("src/app.test.ts:1:");
    expect(output).toContain("[stale]");
    expect(output).toContain("src/app.ts::removed:9  unresolved [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-stale.test.ts`
Expected: FAIL — `expect(received).toContain("[stale]")` because the current implementation does not compare stored step hashes to current content
**Step 3 — Write minimal implementation**
`src/tools/trace.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}
function resolveNode(store: GraphStore, entry: string, file?: string) {
  const matches = store.findNodes(entry, file);
  if (matches.length !== 1) return null;
  return matches[0]!;
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
    const next = store
      .getNeighbors(currentId, { direction: "out", kind: "calls" })
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
  const node = resolveNode(params.store, params.entry, params.file);
  if (!node) return `Entry "${params.entry}" not found`;

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
Run: `bun test test/tool-trace-stale.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
