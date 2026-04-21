# Plan

### Task 1: Repair trace class fallback and symbol lookup messaging

### Task 1: Repair trace class fallback and symbol lookup messaging

**Files:**
- Modify: `src/tools/trace.ts`
- Test: `test/repro-079-trace-class-entry-point.test.ts`
- Test: `test/repro-080-trace-not-found-message.test.ts`
- Regression: `test/tool-trace-static-fallback.test.ts`
- Regression: `test/tool-trace-ambiguous.test.ts`

**Step 1 — Write the failing test**
When the test imports existing symbols, use the real current signatures lifted from source:

```ts
export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}

export function trace(params: TraceParams): string
export function extractFile(file: string, content: string): ExtractionResult
```

Use the existing reproduction tests as the red regression harness. Keep them exactly as below.

`test/repro-079-trace-class-entry-point.test.ts`

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

test("trace does not stop at a class entry point that has methods", () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-079-${Date.now()}`);
  const file = "src/store.ts";
  const content = [
    "export class SqliteGraphStore {",
    "  constructor() {}",
    "  getNode() { return 1; }",
    "  findNodes() { return 2; }",
    "}",
  ].join("\n") + "\n";

  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, file), content);

  const extracted = extractFile(file, content);
  const store = new SqliteGraphStore();
  try {
    store.addNode(extracted.module);
    for (const node of extracted.nodes) store.addNode(node);
    for (const edge of extracted.edges) store.addEdge(edge);

    const output = trace({ entry: "SqliteGraphStore", file, store, projectRoot });
    expect(output).not.toMatch(/SqliteGraphStore\s+class .*leaf/);
    expect(output).toMatch(/constructor|class entry:/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

`test/repro-080-trace-not-found-message.test.ts`

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

function setupWalkFixture() {
  const projectRoot = join(tmpdir(), `pi-cg-repro-080-${Date.now()}`);
  const file = "src/walk.ts";
  const content = "export function walk() {}\n";

  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, file), content);

  const extracted = extractFile(file, content);
  const store = new SqliteGraphStore();
  store.addNode(extracted.module);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);

  return {
    file,
    projectRoot,
    store,
    cleanup() {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("trace labels a missing entry as a symbol lookup failure", () => {
  const fixture = setupWalkFixture();
  try {
    const output = trace({ entry: "runPipeline", store: fixture.store, projectRoot: fixture.projectRoot });

    expect(output).toContain('Symbol "runPipeline" not found');
  } finally {
    fixture.cleanup();
  }
});

test("trace suggests the real symbol location when the file filter misses", () => {
  const fixture = setupWalkFixture();
  try {
    const directOutput = trace({ entry: "walk", file: fixture.file, store: fixture.store, projectRoot: fixture.projectRoot });
    const wrongFileOutput = trace({
      entry: "walk",
      file: "src/does-not-exist.ts",
      store: fixture.store,
      projectRoot: fixture.projectRoot,
    });

    expect(directOutput).toContain("walk");
    expect(wrongFileOutput).toContain("src/walk.ts");
    expect(wrongFileOutput).not.toContain('Entry "walk" not found');
  } finally {
    fixture.cleanup();
  }
});
```

Do not edit `test/tool-trace-static-fallback.test.ts` or `test/tool-trace-ambiguous.test.ts`; they are the unchanged controls for Fixed-When #2 and #5.

**Step 2 — Run test, verify it fails**
Run: `bun test test/repro-079-trace-class-entry-point.test.ts test/repro-080-trace-not-found-message.test.ts test/tool-trace-static-fallback.test.ts test/tool-trace-ambiguous.test.ts`

Expected: FAIL — Bun reports these three live failures while the two control tests stay green:

```text
error: expect(received).toContain(expected)

Expected to contain: "Symbol \"runPipeline\" not found"
Received: "## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nEntry \"runPipeline\" not found"
```

```text
error: expect(received).toContain(expected)

Expected to contain: "src/walk.ts"
Received: "## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nEntry \"walk\" not found"
```

```text
error: expect(received).not.toMatch(expected)

Expected substring or pattern: not /SqliteGraphStore\s+class .*leaf/
Received: "## Trust\nstatus: heuristic\nevidence: none  stale-files: 0/0\nmode: static (heuristic, no runtime evidence)\nsrc/store.ts:1:3f9c  SqliteGraphStore  class [entry-point, leaf, untested]\n"
```

**Step 3 — Write minimal implementation**
Keep the fix trace-local. Do **not** change `src/tools/symbol-resolution.ts`, because `impact()` also uses that resolver and the bug is specific to `trace()`’s not-found handling and class fallback.

Replace `src/tools/trace.ts` with:

```ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatRoleTags, type NodeRole, type SignalComputer } from "../output/signals.js";
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
  const stack: string[] = [startNodeId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    ordered.push(currentId);
    const nextNeighbors = store.getNeighbors(currentId, { direction: "out", kind: "calls" });
    const sorted = nextNeighbors.sort((a, b) =>
      a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || a.node.id.localeCompare(b.node.id)
    );
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!seen.has(sorted[i].node.id)) {
        stack.push(sorted[i].node.id);
      }
    }
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

function formatNodeLine(
  node: GraphNode,
  projectRoot: string,
  signalComputer: SignalComputer,
  rolesOverride?: NodeRole[],
): { line: string; stale: boolean } {
  const anchor = computeAnchor(node, projectRoot);
  const signals = signalComputer.compute(node.id);
  const tags = formatRoleTags({ ...signals, roles: rolesOverride ?? signals.roles });
  return {
    line: `${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""} ${tags}`,
    stale: anchor.stale,
  };
}

function formatLiveTraceLine(
  store: GraphStore,
  nodeId: string,
  projectRoot: string,
  signalComputer: SignalComputer,
  rolesOverride?: NodeRole[],
): { line: string; stale: boolean } {
  const node = store.getNode(nodeId);
  if (!node) return { line: `${nodeId}  unresolved [stale]`, stale: true };
  return formatNodeLine(node, projectRoot, signalComputer, rolesOverride);
}

function formatFileScopedMiss(name: string, requestedFile: string, nodes: GraphNode[], projectRoot: string): string {
  const sorted = [...nodes].sort((a, b) =>
    a.file.localeCompare(b.file) || a.start_line - b.start_line || a.id.localeCompare(b.id)
  );
  const lines: string[] = [`Symbol "${name}" was not found in ${requestedFile}. Matches exist in other files:`, ""];
  for (const node of sorted) {
    const anchor = computeAnchor(node, projectRoot);
    const staleMarker = anchor.stale ? " [stale]" : "";
    lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
  }
  return `${lines.join("\n")}\n`;
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
    notFoundLabel: "Symbol",
  });

  const stats = params.store.getStatistics(params.projectRoot);
  if (resolved.kind === "ambiguous") {
    return prependTrustHeader(resolved.text, { stats });
  }
  if (resolved.kind === "not_found") {
    if (params.file) {
      const unscopedMatches = params.store.findNodes(params.entry);
      if (unscopedMatches.length > 0) {
        const hasLocalExceptions = unscopedMatches.some((match) => computeAnchor(match, params.projectRoot).stale);
        return prependTrustHeader(
          formatFileScopedMiss(params.entry, params.file, unscopedMatches, params.projectRoot),
          { stats, hasLocalExceptions },
        );
      }
    }
    return prependTrustHeader(`Symbol "${params.entry}" not found in the graph\n`, { stats });
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

  if (node.kind === "class") {
    const classSignals = signalComputer.compute(node.id);
    const classLine = formatLiveTraceLine(
      params.store,
      node.id,
      params.projectRoot,
      signalComputer,
      classSignals.roles.filter((role) => role !== "leaf"),
    );
    const body = `${[
      formatModeHeader("static", classLine.stale),
      classLine.line,
      "  → class entry: use symbol_graph to inspect methods, or trace a specific method symbol when one is available",
    ].join("\n")}\n`;
    return prependTrustHeader(body, { stats, mode: "heuristic", hasLocalExceptions: classLine.stale });
  }

  const staticSteps = buildStaticTrace(params.store, node.id)
    .map((step) => formatLiveTraceLine(params.store, step, params.projectRoot, signalComputer));
  const staticStale = staticSteps.some((step) => step.stale);
  const body = `${[formatModeHeader("static", staticStale), ...staticSteps.map((step) => step.line)].join("\n")}\n`;
  return prependTrustHeader(body, { stats, mode: "heuristic", hasLocalExceptions: staticStale });
}
```

This implementation intentionally solves both mismatches in one file:
- class entries stop rendering as `[leaf]` and emit a class-specific redirect line instead of pretending the class is a terminal trace step;
- missing entries use `Symbol`, and file-filter misses retry `store.findNodes(name)` without the file filter so the output can surface the real candidate location(s).

**Step 4 — Run test, verify it passes**
Run: `bun test test/repro-079-trace-class-entry-point.test.ts test/repro-080-trace-not-found-message.test.ts test/tool-trace-static-fallback.test.ts test/tool-trace-ambiguous.test.ts`

Expected: PASS — all 5 tests across the 4 files pass.

**Step 5 — Verify no regressions**
Run: `bun test`

Expected: all passing. Pay particular attention to these existing guards:
- `test/tool-trace-static-fallback.test.ts` — non-class static traces still descend normally
- `test/tool-trace-ambiguous.test.ts` — ambiguity output stays unchanged
- `test/tool-trace-static-cycle.test.ts` — DFS cycle handling is untouched because the class-specific note path short-circuits before static traversal only for `node.kind === "class"`
- `test/tool-trace-coverage.test.ts` / `test/tool-trace-signals.test.ts` — coverage-backed traces and inline role tags still render through the unchanged coverage path
