---
id: 6
title: Report stale static trace call edges
status: approved
depends_on:
  - 1
  - 2
  - 5
no_test: false
files_to_modify:
  - src/tools/trace.ts
files_to_create:
  - test/tool-trace-static-edge-freshness.test.ts
---

### Task 6: Report stale static trace call edges [depends: 1, 2, 5]

**Covers:** AC 3, AC 10, AC 13, AC 14, AC 15

**Files:**
- Modify: `src/tools/trace.ts`
- Test: `test/tool-trace-static-edge-freshness.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-trace-static-edge-freshness.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

test("trace reports stale static call-edge freshness warning", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-static-edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const app = "export function entry() { return leaf(); }\nexport function leaf() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), app);
  const appHash = sha256Hex(app);
  const store = new SqliteGraphStore();

  try {
    store.addNode({ id: "src/app.ts::entry:1", kind: "function", name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: appHash, is_exported: true });
    store.addNode({ id: "src/app.ts::leaf:2", kind: "function", name: "leaf", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: appHash, is_exported: true });
    store.addEdge({
      source: "src/app.ts::entry:1",
      target: "src/app.ts::leaf:2",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "entry calls leaf", content_hash: "old-edge-hash" },
      created_at: 1,
    });
    store.setFileHash("src/app.ts", appHash);

    const output = trace({ entry: "entry", store, projectRoot });
    expect(output).toContain("Trust: partial");
    expect(output).toContain("stale edges: 1");
    expect(output).toContain("trace path may be unreliable; refresh index before relying on this result");
    expect(output).toContain("mode: static (heuristic, no runtime evidence) [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-static-edge-freshness.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` for expected substring `"Trust: partial"`

**Step 3 — Write minimal implementation**
Apply these exact edits to `src/tools/trace.ts`. Task 5 already imported `GraphEdge`, added `traceFreshness(...)`, and replaced `trace(...)`; this task only adds static call-edge collection and passes those edges into the existing freshness helper.

1. Add this helper immediately after `traceFreshness(...)`:

```ts
function collectStaticTraceEdges(store: GraphStore, nodeIds: string[]): GraphEdge[] {
  const included = new Set(nodeIds);
  const edges: GraphEdge[] = [];
  for (const sourceId of nodeIds) {
    for (const neighbor of store.getNeighbors(sourceId, { direction: "out", kind: "calls" })) {
      if (included.has(neighbor.node.id)) edges.push(neighbor.edge);
    }
  }
  return edges;
}
```

2. Replace the static fallback block at the end of `trace(...)` with this complete block:

```ts
  const staticNodeIds = buildStaticTrace(params.store, node.id);
  const staticSteps = staticNodeIds
    .map((step) => formatLiveTraceLine(params.store, step, params.projectRoot, signalComputer));
  const staticEdges = collectStaticTraceEdges(params.store, staticNodeIds);
  const freshness = traceFreshness(params, node, staticNodeIds, [], staticEdges);
  const staticStale = staticSteps.some((step) => step.stale) || freshness.status !== "fresh";
  const body = `${[formatModeHeader("static", staticStale), ...staticSteps.map((step) => step.line)].join("\n")}\n`;
  return prependFreshnessHeader(body, freshness);
```

This uses the existing `GraphStore.getNeighbors(nodeId, { direction: "out", kind: "calls" })` API and the `GraphEdge` type imported by Task 5.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-static-edge-freshness.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all tests pass and TypeScript check completes with no errors.
