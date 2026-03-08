---
id: 7
title: Fall back to deterministic static traces when coverage is missing
status: approved
depends_on:
  - 5
  - 6
no_test: false
files_to_modify:
  - src/tools/trace.ts
files_to_create:
  - test/tool-trace-static-fallback.test.ts
---

### Task 7: Fall back to deterministic static traces when coverage is missing [depends: 5, 6]
**Files:**
- Modify: `src/tools/trace.ts`
- Create: `test/tool-trace-static-fallback.test.ts`
**ACs covered:** 15

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace falls back to a deterministic static call path when no coverage trace exists", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-static-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function entry() { return first(); }\nexport function first() { return second(); }\nexport function second() { return 1; }\n",
  );

  const store = new SqliteGraphStore();
  try {
    const entry = { id: "src/app.ts::entry:1", kind: "function" as const, name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h-app" };
    const first = { id: "src/app.ts::first:2", kind: "function" as const, name: "first", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: "h-app" };
    const second = { id: "src/app.ts::second:3", kind: "function" as const, name: "second", file: "src/app.ts", start_line: 3, end_line: 3, content_hash: "h-app" };

    store.addNode(entry);
    store.addNode(first);
    store.addNode(second);
    store.addEdge({ source: entry.id, target: first.id, kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "first", content_hash: "h-app" }, created_at: 1 });
    store.addEdge({ source: first.id, target: second.id, kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "second", content_hash: "h-app" }, created_at: 2 });

    const output = trace({ entry: "entry", file: "src/app.ts", store, projectRoot });
    expect(output).toContain("mode: static");
    expect(output).toContain("entry");
    expect(output).toContain("first");
    expect(output).toContain("second");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-static-fallback.test.ts`
Expected: FAIL — `expect(received).toContain("mode: static")` because the current implementation returns `Entry "entry" not found` when no coverage trace is available.

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

export function trace(params: TraceParams): string {
  const node = resolveNode(params.store, params.entry, params.file);
  if (!node) return `Entry "${params.entry}" not found`;

  const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const lines = ["mode: coverage"];
      for (const step of [...coverage.steps].sort((a, b) => a.ordinal - b.ordinal)) {
        lines.push(formatTraceLine(params.store, step.nodeId, params.projectRoot));
      }
      return `${lines.join("\n")}\n`;
    }
  }

  const staticSteps = buildStaticTrace(params.store, node.id);
  return `${["mode: static", ...staticSteps.map((step) => formatTraceLine(params.store, step, params.projectRoot))].join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-static-fallback.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
