---
id: 6
title: Resolve endpoint entries to coverage-backed traces
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - src/tools/trace.ts
files_to_create:
  - test/tool-trace-endpoint.test.ts
---

### Task 6: Resolve endpoint entries to coverage-backed traces [depends: 5]
- Modify: `src/tools/trace.ts`
- Create: `test/tool-trace-endpoint.test.ts`
**ACs covered:** 14
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";
test("trace resolves endpoint entries through routes_to edges to the same deterministic coverage-backed trace policy", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-endpoint-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "api.ts"), "export function handler() { return service(); }\nexport function service() { return 1; }\napp.get('/users', handler);\n");
  writeFileSync(join(projectRoot, "src", "api.test.ts"), "export function usersTest() { return handler(); }\n");
  const store = new SqliteGraphStore();
  try {
    const endpoint = { id: "endpoint:GET:/users", kind: "endpoint" as const, name: "endpoint:GET:/users", file: "src/api.ts", start_line: 3, end_line: 3, content_hash: "h-api" };
    const handler = { id: "src/api.ts::handler:1", kind: "function" as const, name: "handler", file: "src/api.ts", start_line: 1, end_line: 1, content_hash: "h-api" };
    const service = { id: "src/api.ts::service:2", kind: "function" as const, name: "service", file: "src/api.ts", start_line: 2, end_line: 2, content_hash: "h-api" };
    const testNode = { id: "src/api.test.ts::usersTest:1", kind: "test" as const, name: "usersTest", file: "src/api.test.ts", start_line: 1, end_line: 1, content_hash: "h-test" };
    store.addNode(endpoint);
    store.addNode(handler);
    store.addNode(service);
    store.addNode(testNode);
    store.addEdge({
      source: handler.id,
      target: endpoint.id,
      kind: "routes_to",
      provenance: { source: "ast-grep", confidence: 0.9, evidence: "app.get('/users', handler)", content_hash: "h-api" },
      created_at: 1,
    });
    store.addEdge({
      source: handler.id,
      target: testNode.id,
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 1, evidence: "users", content_hash: handler.content_hash },
      created_at: 2,
    });
    store.saveTestTrace({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: testNode.content_hash },
        { nodeId: handler.id, ordinal: 1, contentHash: handler.content_hash },
        { nodeId: service.id, ordinal: 2, contentHash: service.content_hash },
      ],
    });
    const output = trace({ entry: "endpoint:GET:/users", store, projectRoot });
    expect(output).toContain("mode: coverage");
    expect(output).toContain("usersTest");
    expect(output).toContain("handler");
    expect(output).toContain("service");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-endpoint.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because the current implementation does not resolve endpoint entries through `routes_to`
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
function formatTraceLine(store: GraphStore, nodeId: string, projectRoot: string): string {
  const node = store.getNode(nodeId);
  if (!node) return `${nodeId}  unresolved`;
  const { anchor } = computeAnchor(node, projectRoot);
  return `${anchor}  ${node.name}  ${node.kind}`;
}
function pickCoverageTraceForNode(store: GraphStore, nodeId: string): string | null {
  const coveringTests = store
    .getNeighbors(nodeId, { direction: "out", kind: "tested_by" })
    .sort((a, b) => a.node.id.localeCompare(b.node.id));
  for (const candidate of coveringTests) {
    const trace = store.getTestTrace(candidate.node.id);
    if (trace) return trace.testNodeId;
  }

  return null;
}
function resolveCoverageTraceId(store: GraphStore, nodeId: string): string | null {
  const node = store.getNode(nodeId);
  if (!node) return null;
  if (node.kind === "test") return node.id;
  if (node.kind === "endpoint") {
    const handlers = store
      .getNeighbors(node.id, { direction: "in", kind: "routes_to" })
      .sort((a, b) => a.node.id.localeCompare(b.node.id));
    for (const handler of handlers) {
      const traceId = pickCoverageTraceForNode(store, handler.node.id);
      if (traceId) return traceId;
    }
    return null;
  }
  return pickCoverageTraceForNode(store, node.id);
}
export function trace(params: TraceParams): string {
  const node = resolveNode(params.store, params.entry, params.file);
  if (!node) return `Entry "${params.entry}" not found`;

  const testTraceId = resolveCoverageTraceId(params.store, node.id);
  if (!testTraceId) return `Entry "${params.entry}" not found`;

  const record = params.store.getTestTrace(testTraceId);
  if (!record) return `Entry "${params.entry}" not found`;

  const lines = ["mode: coverage"];
  for (const step of [...record.steps].sort((a, b) => a.ordinal - b.ordinal)) {
    lines.push(formatTraceLine(params.store, step.nodeId, params.projectRoot));
  }
  return `${lines.join("\n")}\n`;
}
```
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-endpoint.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
