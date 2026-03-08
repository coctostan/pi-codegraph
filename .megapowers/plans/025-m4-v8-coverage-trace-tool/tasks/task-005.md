---
id: 5
title: Return coverage-backed traces for tests and production symbols
status: approved
depends_on:
  - 3
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/trace.ts
  - test/tool-trace-coverage.test.ts
---

### Task 5: Return coverage-backed traces for tests and production symbols [depends: 3, 4]
- Create: `src/tools/trace.ts`
- Create: `test/tool-trace-coverage.test.ts`
**ACs covered:** 12, 13, 17, 19

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace returns stored coverage traces for tests and deterministically selects one covering test for a production symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-coverage-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function prod() { return helper(); }\nexport function helper() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "app.test.ts"), "export function alphaTest() { return prod(); }\nexport function betaTest() { return prod(); }\n");

  const store = new SqliteGraphStore();
  try {
    const alpha = { id: "src/app.test.ts::alphaTest:1", kind: "test" as const, name: "alphaTest", file: "src/app.test.ts", start_line: 1, end_line: 1, content_hash: "h-test" };
    const beta = { id: "src/app.test.ts::betaTest:2", kind: "test" as const, name: "betaTest", file: "src/app.test.ts", start_line: 2, end_line: 2, content_hash: "h-test" };
    const prod = { id: "src/app.ts::prod:1", kind: "function" as const, name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h-app" };
    const helper = { id: "src/app.ts::helper:2", kind: "function" as const, name: "helper", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: "h-app" };

    store.addNode(alpha);
    store.addNode(beta);
    store.addNode(prod);
    store.addNode(helper);
    store.addEdge({ source: prod.id, target: alpha.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "alpha", content_hash: prod.content_hash }, created_at: 1 });
    store.addEdge({ source: prod.id, target: beta.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "beta", content_hash: prod.content_hash }, created_at: 2 });

    store.saveTestTrace({
      testNodeId: alpha.id,
      steps: [
        { nodeId: alpha.id, ordinal: 0, contentHash: alpha.content_hash },
        { nodeId: prod.id, ordinal: 1, contentHash: prod.content_hash },
        { nodeId: helper.id, ordinal: 2, contentHash: helper.content_hash },
      ],
    });

    store.saveTestTrace({
      testNodeId: beta.id,
      steps: [
        { nodeId: beta.id, ordinal: 0, contentHash: beta.content_hash },
        { nodeId: prod.id, ordinal: 1, contentHash: prod.content_hash },
      ],
    });

    const direct = trace({ entry: "alphaTest", file: "src/app.test.ts", store, projectRoot });
    const byProd = trace({ entry: "prod", file: "src/app.ts", store, projectRoot });

    expect(direct).toContain("mode: coverage");
    expect(direct).toContain("src/app.test.ts:1:");
    expect(direct).toContain("src/app.ts:1:");
    expect(direct).toContain("src/app.ts:2:");
    expect(byProd).toContain("alphaTest");
    expect(byProd).not.toContain("betaTest");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-coverage.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/trace.js' from 'test/tool-trace-coverage.test.ts'`

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
    const record = store.getTestTrace(candidate.node.id);
    if (record) return record.testNodeId;
  }

  return null;
}

function resolveCoverageTraceId(store: GraphStore, nodeId: string): string | null {
  const node = store.getNode(nodeId);
  if (!node) return null;
  if (node.kind === "test") return node.id;
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
Run: `bun test test/tool-trace-coverage.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
