---
id: 5
title: Warn on unreliable coverage trace freshness
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - src/tools/trace.ts
  - test/tool-trace-trust-heuristic.test.ts
  - test/tool-trace-trust-runtime.test.ts
  - test/tool-trace-static-mode-header.test.ts
  - test/tool-trace-signals.test.ts
  - test/extension-suppress-trust-header-trace.test.ts
  - test/extension-suppress-trust-header-interactions.test.ts
  - test/extension-readonly-trust-gating.test.ts
files_to_create:
  - test/tool-trace-freshness-warning.test.ts
---

### Task 5: Warn on unreliable coverage trace freshness [depends: 1, 2]

**Covers:** AC 2, AC 3, AC 10, AC 11, AC 13, AC 14

**Files:**
- Modify: `src/tools/trace.ts`
- Modify existing tests: `test/tool-trace-trust-heuristic.test.ts`, `test/tool-trace-trust-runtime.test.ts`, `test/tool-trace-static-mode-header.test.ts`, `test/tool-trace-signals.test.ts`, `test/extension-suppress-trust-header-trace.test.ts`, `test/extension-suppress-trust-header-interactions.test.ts`, `test/extension-readonly-trust-gating.test.ts`
- Test: `test/tool-trace-freshness-warning.test.ts`

**Step 1 — Write the failing tests**
Create `test/tool-trace-freshness-warning.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

function createCoverageFixture(includeUnresolved = false): {
  projectRoot: string;
  store: SqliteGraphStore;
  prod: GraphNode;
  testNode: GraphNode;
  prodV1: string;
  testV1: string;
} {
  const projectRoot = join(tmpdir(), `pi-cg-trace-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const prodV1 = "export function prod() { return 1; }\n";
  const testV1 = "export function prodTest() { return prod(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), prodV1);
  writeFileSync(join(projectRoot, "src", "app.test.ts"), testV1);
  const prodHash = sha256Hex(prodV1);
  const testHash = sha256Hex(testV1);
  const store = new SqliteGraphStore();
  const prod: GraphNode = { id: "src/app.ts::prod:1", kind: "function", name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: prodHash };
  const testNode: GraphNode = { id: "src/app.test.ts::prodTest:1", kind: "test", name: "prodTest", file: "src/app.test.ts", start_line: 1, end_line: 1, content_hash: testHash };

  store.addNode(prod);
  store.addNode(testNode);
  store.addEdge({ source: prod.id, target: testNode.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "prod", content_hash: prodHash }, created_at: 1 });
  store.setFileHash("src/app.ts", prodHash);
  store.setFileHash("src/app.test.ts", testHash);
  store.saveTestTrace({
    testNodeId: testNode.id,
    steps: [
      { nodeId: testNode.id, ordinal: 0, contentHash: testHash },
      { nodeId: prod.id, ordinal: 1, contentHash: prodHash },
      ...(includeUnresolved ? [{ nodeId: "src/app.ts::removed:9", ordinal: 2, contentHash: "old-removed-hash" }] : []),
    ],
  });
  return { projectRoot, store, prod, testNode, prodV1, testV1 };
}

test("trace reports unknown freshness for unresolved stored coverage steps", () => {
  const fixture = createCoverageFixture(true);
  try {
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store: fixture.store, projectRoot: fixture.projectRoot });
    expect(output).toContain("Trust: unknown");
    expect(output).toContain("trace path may be unreliable; refresh index before relying on this result");
    expect(output).toContain("src/app.ts::removed:9  unresolved [stale]");
  } finally {
    fixture.store.close();
    rmSync(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("trace reports changed files and row-level stale markers for stale stored trace steps", () => {
  const fixture = createCoverageFixture(false);
  try {
    writeFileSync(join(fixture.projectRoot, "src", "app.ts"), "export function prod() { return 2; }\n");
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store: fixture.store, projectRoot: fixture.projectRoot });
    expect(output).toContain("Trust: partial");
    expect(output).toContain("changed files: src/app.ts");
    expect(output).toContain("affected symbols: prod");
    expect(output).toContain("mode: coverage [stale]");
    expect(output).toContain("prod  function [stale]");
  } finally {
    fixture.store.close();
    rmSync(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("trace reports deleted files for stored trace steps whose files were removed", () => {
  const fixture = createCoverageFixture(false);
  try {
    unlinkSync(join(fixture.projectRoot, "src", "app.ts"));
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store: fixture.store, projectRoot: fixture.projectRoot });
    expect(output).toContain("Trust: partial");
    expect(output).toContain("deleted files: src/app.ts");
    expect(output).toContain("mode: coverage [stale]");
  } finally {
    fixture.store.close();
    rmSync(fixture.projectRoot, { recursive: true, force: true });
  }
});
```

Update existing trace tests in the same RED step so the full suite expects compact freshness headers:

- In `test/tool-trace-trust-heuristic.test.ts`, replace the whole legacy header/index assertion block with:
  ```ts
  expect(lines[0]).toBe("Trust: fresh");
  expect(lines[1]).toBe("mode: static (heuristic, no runtime evidence)");
  expect(lines[2]).toContain("src/app.ts:1:");
  expect(lines[2]).toContain("entry  function");
  ```
- In `test/tool-trace-static-mode-header.test.ts`, replace the whole legacy header/index assertion block with:
  ```ts
  expect(lines[0]).toBe("Trust: fresh");
  expect(lines[1]).toBe("mode: static (heuristic, no runtime evidence)");
  expect(lines[2]).toContain("src/app.ts:1:");
  expect(lines[2]).toContain("entry  function");
  expect(lines).toHaveLength(5);
  ```
- In `test/tool-trace-trust-runtime.test.ts`, replace the full fresh and mixed legacy header assertion blocks with:
  ```ts
  expect(freshLines[0]).toBe("Trust: fresh");
  expect(freshLines[1]).toBe("mode: coverage");
  expect(freshOutput).not.toContain("function [stale]");

  expect(mixedLines[0]).toBe("Trust: partial");
  expect(mixedOutput).toContain("changed files: src/app.ts");
  expect(mixedOutput).toContain("trace path may be unreliable; refresh index before relying on this result");
  expect(mixedOutput).toContain("mode: coverage [stale]");
  expect(mixedOutput).toContain("prod  function [stale]");
  ```
- In `test/tool-trace-signals.test.ts`, replace only the stale coverage header/mode assertions with:
  ```ts
  expect(lines[0]).toBe("Trust: partial");
  expect(lines).toContain("mode: coverage [stale]");
  ```
  Keep the existing role-tag regex assertions unchanged.
- In `test/extension-suppress-trust-header-trace.test.ts`, replace the suppressed and baseline assertions with:
  ```ts
  expect(suppressedText.includes("## Trust")).toBe(false);
  expect(suppressedText.includes("Trust: ")).toBe(false);
  expect(suppressedText).toContain("mode: static (heuristic, no runtime evidence)");

  expect(baselineText.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")).toBe(true);
  ```
- In `test/extension-suppress-trust-header-interactions.test.ts`, replace the final trace test assertion:
  ```ts
  expect(omittedText.startsWith("## Trust\nstatus: heuristic")).toBe(true);
  ```
  with:
  ```ts
  expect(omittedText.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")).toBe(true);
  ```
- In `test/extension-readonly-trust-gating.test.ts`, replace the non-fresh trace expectation with:
  ```ts
  expect(text.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")).toBe(true);
  ```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-freshness-warning.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` for expected substring `"Trust: unknown"`

**Step 3 — Write minimal implementation**
Apply these exact edits to `src/tools/trace.ts`.

1. Replace the imports for `GraphNode` and trust with these imports:

```ts
import type { GraphStore } from "../graph/store.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { computeAnchor } from "../output/anchoring.js";
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
import { createSignalComputer, formatRoleTags, type NodeRole, type SignalComputer } from "../output/signals.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";
```

2. Add this helper immediately after `formatModeHeader(...)`:

```ts
function traceFreshness(
  params: TraceParams,
  targetNode: GraphNode,
  nodeIds: string[],
  unresolvedItems: string[] = [],
  resultEdges: GraphEdge[] = [],
) {
  const resultNodes = nodeIds.flatMap((id) => {
    const node = params.store.getNode(id);
    return node ? [node] : [];
  });
  return evaluateFreshness({
    store: params.store,
    projectRoot: params.projectRoot,
    targetNodes: [targetNode],
    resultNodes: [targetNode, ...resultNodes],
    resultEdges,
    unresolvedItems,
    recommendation: "trace path may be unreliable; refresh index before relying on this result",
  });
}
```

3. Replace the entire existing `trace(...)` function with this complete implementation:

```ts
export function trace(params: TraceParams): string {
  const resolved = resolveUniqueSymbol({
    name: params.entry,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
    notFoundLabel: "Symbol",
  });

  const emptyFreshness = evaluateFreshness({
    store: params.store,
    projectRoot: params.projectRoot,
    recommendation: "trace path may be unreliable; refresh index before relying on this result",
  });

  if (resolved.kind === "ambiguous") {
    return prependFreshnessHeader(resolved.text, emptyFreshness);
  }
  if (resolved.kind === "not_found") {
    if (params.file) {
      const unscopedMatches = params.store.findNodes(params.entry);
      if (unscopedMatches.length > 0) {
        const freshness = evaluateFreshness({
          store: params.store,
          projectRoot: params.projectRoot,
          resultNodes: unscopedMatches,
          recommendation: "trace path may be unreliable; refresh index before relying on this result",
        });
        return prependFreshnessHeader(
          formatFileScopedMiss(params.entry, params.file, unscopedMatches, params.projectRoot),
          freshness,
        );
      }
    }
    return prependFreshnessHeader(`Symbol "${params.entry}" not found in the graph\n`, emptyFreshness);
  }

  const node = resolved.node;
  const signalComputer = createSignalComputer(params.store);
  const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const orderedSteps = coverage.steps.sort((a, b) => a.ordinal - b.ordinal);
      const rendered = orderedSteps
        .map((step) => formatStoredTraceLine(params.store, step.nodeId, step.contentHash, params.projectRoot, signalComputer));
      const unresolvedItems = orderedSteps.filter((step) => !params.store.getNode(step.nodeId)).map((step) => step.nodeId);
      const freshness = traceFreshness(params, node, orderedSteps.map((step) => step.nodeId), unresolvedItems);
      const traceStale = rendered.some((item) => item.stale) || freshness.status !== "fresh";
      const body = `${[formatModeHeader("coverage", traceStale), ...rendered.map((item) => item.line)].join("\n")}\n`;
      return prependFreshnessHeader(body, freshness);
    }
  }

  if (node.kind === "class") {
    const classSignals = signalComputer.compute(node.id);
    const classLine = formatLiveTraceLine(
      params.store,
      node.id,
      params.projectRoot,
      signalComputer,
      classSignals.roles.filter((role) => role !== "leaf"),
    );
    const freshness = traceFreshness(params, node, [node.id]);
    const classStale = classLine.stale || freshness.status !== "fresh";
    const body = `${[
      formatModeHeader("static", classStale),
      classLine.line,
      "  → class entry: use symbol_graph to inspect methods, or trace a specific method symbol when one is available",
    ].join("\n")}\n`;
    return prependFreshnessHeader(body, freshness);
  }

  const staticNodeIds = buildStaticTrace(params.store, node.id);
  const staticSteps = staticNodeIds
    .map((step) => formatLiveTraceLine(params.store, step, params.projectRoot, signalComputer));
  const freshness = traceFreshness(params, node, staticNodeIds);
  const staticStale = staticSteps.some((step) => step.stale) || freshness.status !== "fresh";
  const body = `${[formatModeHeader("static", staticStale), ...staticSteps.map((step) => step.line)].join("\n")}\n`;
  return prependFreshnessHeader(body, freshness);
}
```

This task intentionally does not yet pass static `calls` edges into `traceFreshness`; Task 6 adds the dedicated stale static call-edge coverage and implementation.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-freshness-warning.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
