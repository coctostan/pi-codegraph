---
id: 3
title: Report symbol graph freshness
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - src/tools/symbol-graph.ts
  - test/tool-symbol-graph-trust-header.test.ts
  - test/tool-symbol-graph-contract-include.test.ts
  - test/extension-readonly-trust-gating.test.ts
  - test/extension-suppress-trust-header-symbol-graph.test.ts
  - test/extension-suppress-trust-header-interactions.test.ts
files_to_create:
  - test/tool-symbol-graph-freshness-report.test.ts
---

### Task 3: Report symbol graph freshness [depends: 1, 2]

**Covers:** AC 2, AC 3, AC 8, AC 11, AC 13, AC 14

**Files:**
- Modify: `src/tools/symbol-graph.ts`
- Modify existing tests: `test/tool-symbol-graph-trust-header.test.ts`, `test/tool-symbol-graph-contract-include.test.ts`, `test/extension-readonly-trust-gating.test.ts`, `test/extension-suppress-trust-header-symbol-graph.test.ts`, `test/extension-suppress-trust-header-interactions.test.ts`
- Test: `test/tool-symbol-graph-freshness-report.test.ts`

**Step 1 — Write the failing tests**
Create `test/tool-symbol-graph-freshness-report.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function setupFooBar(): {
  projectRoot: string;
  store: SqliteGraphStore;
  cleanup: () => void;
} {
  const projectRoot = join(tmpdir(), `pi-cg-symbol-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fooV1 = "export function foo() { return bar(); }\n";
  const barV1 = "export function bar() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "foo.ts"), fooV1);
  writeFileSync(join(projectRoot, "src", "bar.ts"), barV1);
  const fooHash = sha256Hex(fooV1);
  const barHash = sha256Hex(barV1);
  const store = new SqliteGraphStore();
  store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 1, content_hash: fooHash, is_exported: true });
  store.addNode({ id: "src/bar.ts::bar:1", kind: "function", name: "bar", file: "src/bar.ts", start_line: 1, end_line: 1, content_hash: barHash, is_exported: true });
  store.addEdge({ source: "src/foo.ts::foo:1", target: "src/bar.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.8, evidence: "foo calls bar", content_hash: fooHash }, created_at: 1 });
  store.setFileHash("src/foo.ts", fooHash);
  store.setFileHash("src/bar.ts", barHash);
  return {
    projectRoot,
    store,
    cleanup: () => {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("symbolGraph reports partial freshness for stale returned neighborhood evidence", () => {
  const { projectRoot, store, cleanup } = setupFooBar();
  try {
    const fresh = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
    expect(fresh.split("\n")[0]).toBe("Trust: fresh");

    writeFileSync(join(projectRoot, "src", "bar.ts"), "export function bar() { return 2; }\n");
    const partial = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
    expect(partial).toContain("Trust: partial");
    expect(partial).toContain("changed files: src/bar.ts");
    expect(partial).toContain("affected symbols: bar");
    expect(partial).toContain("bar  calls  confidence:0.8  tree-sitter [stale]");
  } finally {
    cleanup();
  }
});

test("symbolGraph reports stale freshness when the target symbol file changed", () => {
  const { projectRoot, store, cleanup } = setupFooBar();
  try {
    writeFileSync(join(projectRoot, "src", "foo.ts"), "export function foo() { return bar() + 1; }\n");
    const stale = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
    expect(stale).toContain("Trust: stale");
    expect(stale).toContain("changed files: src/foo.ts");
    expect(stale).toContain("affected symbols: bar, foo");
  } finally {
    cleanup();
  }
});

test("symbolGraph freshness ignores stale neighbors omitted by the rendered limit", () => {
  const projectRoot = join(tmpdir(), `pi-cg-symbol-limit-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const root = "export function root() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "root.ts"), root);
  const rootHash = sha256Hex(root);
  const store = new SqliteGraphStore();

  try {
    store.addNode({ id: "src/root.ts::root:1", kind: "function", name: "root", file: "src/root.ts", start_line: 1, end_line: 1, content_hash: rootHash, is_exported: true });
    store.setFileHash("src/root.ts", rootHash);

    for (let i = 0; i < 3; i++) {
      const file = `src/dep${i}.ts`;
      const name = `dep${i}`;
      const content = `export function ${name}() { return ${i}; }\n`;
      writeFileSync(join(projectRoot, file), content);
      const hash = sha256Hex(content);
      const id = `${file}::${name}:1`;
      store.addNode({ id, kind: "function", name, file, start_line: 1, end_line: 1, content_hash: hash, is_exported: true });
      store.addEdge({ source: "src/root.ts::root:1", target: id, kind: "calls", provenance: { source: "tree-sitter", confidence: i === 2 ? 0.1 : 0.9, evidence: `${name}:1`, content_hash: rootHash }, created_at: i + 1 });
      store.setFileHash(file, hash);
    }

    writeFileSync(join(projectRoot, "src", "dep2.ts"), "export function dep2() { return 99; }\n");
    const output = symbolGraph({ name: "root", include: ["neighborhood"], limit: 2, store, projectRoot });
    expect(output.split("\n")[0]).toBe("Trust: fresh");
    expect(output).toContain("dep0");
    expect(output).toContain("dep1");
    expect(output).not.toContain("dep2");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update the existing symbol graph trust-header tests in the same RED step so the full suite expects the new compact format:

- In `test/tool-symbol-graph-trust-header.test.ts`, replace the whole legacy header assertion block with:
  ```ts
  expect(freshLines[0]).toBe("Trust: fresh");
  expect(freshOutput).toContain("## foo (function)");
  expect(freshOutput).not.toContain("bar  calls  confidence:0.7  agent [stale]");

  expect(mixedLines[0]).toBe("Trust: partial");
  expect(mixedOutput).toContain("changed files: src/a.ts");
  expect(mixedOutput).toContain("stale edges: 1");
  expect(mixedOutput).toContain("bar  calls  confidence:0.7  agent [stale]");
  ```
- In `test/tool-symbol-graph-contract-include.test.ts`, replace both occurrences of `expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);` with:
  ```ts
  expect((withContract.match(/^Trust: /gm) ?? []).length).toBe(1);
  ```
- In `test/extension-readonly-trust-gating.test.ts`, change the fresh `symbol_graph` assertion from “no Trust header” to:
  ```ts
  expect(text.startsWith("Trust: fresh\n## foo (function)")).toBe(true);
  ```
- In `test/extension-suppress-trust-header-symbol-graph.test.ts`, replace stale-baseline and suppressed-header assertions with:
  ```ts
  expect(baselineText).toContain("Trust: stale");
  expect(suppressedText.includes("## Trust")).toBe(false);
  expect(suppressedText.includes("Trust: ")).toBe(false);
  expect(suppressedText).toContain("## foo (function)");
  ```
- In `test/extension-suppress-trust-header-interactions.test.ts`, update the symbol_graph-specific assertions:
  ```ts
  expect(text.includes("## Trust")).toBe(false);
  expect(text.includes("Trust: ")).toBe(false);
  expect(text).toMatch(/indexing-failed \(\d+s ago\): readonly database/);

  expect(baselineText.startsWith("Trust: fresh\n## foo (function)")).toBe(true);

  const trustIndex = baselineLines.findIndex((line) => line.startsWith("Trust: "));
  expect(trustIndex).toBeGreaterThanOrEqual(0);
  let bodyStart = trustIndex + 1;
  while ((baselineLines[bodyStart] ?? "").startsWith("- ")) bodyStart++;
  const withoutTrust = [
    ...baselineLines.slice(0, trustIndex),
    ...baselineLines.slice(bodyStart),
  ].join("\n");

  expect(suppressedText.includes("## Trust")).toBe(false);
  expect(suppressedText.includes("Trust: ")).toBe(false);
  expect(suppressedText).toBe(withoutTrust);
  ```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-freshness-report.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` for `fresh.split("\n")[0]`: Expected: `"Trust: fresh"`; Received: `"## Trust"`

**Step 3 — Write minimal implementation**
Apply these exact edits to `src/tools/symbol-graph.ts`.

1. Replace the existing import block at the top so the trust import is removed and the freshness/types imports are present:

```ts
import type { GraphStore, NeighborResult } from "../graph/store.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  type AnchoredNeighbor,
  type NeighborSection,
  type NamedSection,
} from "../output/anchoring.js";
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
import { createSignalComputer, type NodeSignals } from "../output/signals.js";
import { renderSymbolCardBody, renderSymbolSourceSection } from "./symbol-card.js";
import { renderSymbolContractBody } from "./symbol-contract.js";
```

2. Add these helpers immediately above `export function symbolGraph(...)`. They intentionally mirror `renderLegacyNeighborhoodBody(...)` and `renderSymbolCardBody(...)` so freshness is computed only from rows actually returned to the agent:

```ts
function collectVisibleNeighborhoodScope(params: SymbolGraphParams, node: GraphNode): {
  resultNodes: GraphNode[];
  resultEdges: GraphEdge[];
} {
  const limit = params.limit ?? 10;
  const buckets = new Map<string, NeighborResult[]>();
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of params.store.getNeighbors(node.id)) {
    if (nr.node.file.startsWith("__meta__")) continue;
    if (nr.node.file.startsWith("__unresolved__")) {
      unresolvedResults.push(nr);
      continue;
    }
    const direction = nr.edge.target === node.id ? "in" : "out";
    const title = sectionTitle(nr.edge.kind, direction);
    const bucket = buckets.get(title) ?? [];
    bucket.push(nr);
    buckets.set(title, bucket);
  }

  const sectionOrder = [
    "Callers", "Callees", "Imports", "Imported By",
    "Implemented By", "Implements",
    "Extended By", "Extends",
    "Tested By", "Tests",
    "Co-changes With",
    "Rendered By", "Renders",
    "Routed From", "Routes To",
  ];
  const visible: NeighborResult[] = [];
  for (const title of sectionOrder) {
    const bucket = buckets.get(title);
    if (bucket && bucket.length > 0) {
      visible.push(...rankNeighbors(bucket, limit).kept);
      buckets.delete(title);
    }
  }
  for (const bucket of buckets.values()) visible.push(...rankNeighbors(bucket, limit).kept);
  visible.push(...rankNeighbors(unresolvedResults, limit).kept);

  return {
    resultNodes: visible
      .filter((nr) => !nr.node.file.startsWith("__unresolved__"))
      .map((nr) => nr.node),
    resultEdges: visible.map((nr) => nr.edge),
  };
}

function collectDefaultCardScope(params: SymbolGraphParams, node: GraphNode): {
  resultNodes: GraphNode[];
  resultEdges: GraphEdge[];
} {
  const allNeighbors = params.store.getNeighbors(node.id).filter(
    (nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"),
  );
  const tests = allNeighbors.filter((nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id);
  const callers = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.target === node.id).slice(0, 5);
  const callees = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.source === node.id).slice(0, 5);
  const imports = allNeighbors.filter((nr) => nr.edge.kind === "imports" && nr.edge.source === node.id).slice(0, 5);
  const extendsOut = allNeighbors.filter((nr) => nr.edge.kind === "extends" && nr.edge.source === node.id).slice(0, 5);
  const implementsOut = allNeighbors.filter((nr) => nr.edge.kind === "implements" && nr.edge.source === node.id).slice(0, 5);
  const visible = [...tests, ...callers, ...callees, ...imports, ...extendsOut, ...implementsOut];
  return {
    resultNodes: visible.map((nr) => nr.node),
    resultEdges: visible.map((nr) => nr.edge),
  };
}

function collectSymbolGraphScope(params: SymbolGraphParams): {
  targetNodes: GraphNode[];
  resultNodes: GraphNode[];
  resultEdges: GraphEdge[];
} {
  const resolvedNodes = params.store.findNodes(params.name, params.file);
  const targetNodes = resolvedNodes.length === 1 ? [resolvedNodes[0]!] : [];
  const resultNodes = new Map<string, GraphNode>();
  const resultEdges: GraphEdge[] = [];

  for (const node of resolvedNodes) resultNodes.set(node.id, node);
  if (resolvedNodes.length === 1) {
    const node = resolvedNodes[0]!;
    const scoped = (params.include ?? []).includes("neighborhood")
      ? collectVisibleNeighborhoodScope(params, node)
      : collectDefaultCardScope(params, node);
    for (const resultNode of scoped.resultNodes) resultNodes.set(resultNode.id, resultNode);
    resultEdges.push(...scoped.resultEdges);
  }

  return { targetNodes, resultNodes: [...resultNodes.values()], resultEdges };
}
```

3. Replace the entire `symbolGraph` function with this complete implementation:

```ts
export function symbolGraph(params: SymbolGraphParams): string {
  const { include } = params;
  const resolvedNodes = params.store.findNodes(params.name, params.file);
  const useNeighborhoodBase = (include ?? []).includes("neighborhood");
  const base = useNeighborhoodBase
    ? renderLegacyNeighborhoodBody(params)
    : renderSymbolCardBody({
        name: params.name,
        file: params.file,
        store: params.store,
        projectRoot: params.projectRoot,
      });
  let body = base.body;
  if (resolvedNodes.length === 1 && (include ?? []).includes("contract")) {
    const renderedContract = renderSymbolContractBody({
      name: params.name,
      file: params.file,
      store: params.store,
      projectRoot: params.projectRoot,
    });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${renderedContract.body}`;
  }

  if (resolvedNodes.length === 1 && (include ?? []).includes("source")) {
    const renderedSource = renderSymbolSourceSection({
      name: params.name,
      file: params.file,
      store: params.store,
      projectRoot: params.projectRoot,
    });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${renderedSource.body}`;
  }

  const freshness = evaluateFreshness({
    store: params.store,
    projectRoot: params.projectRoot,
    ...collectSymbolGraphScope(params),
  });
  return prependFreshnessHeader(body, freshness);
}
```

This removes the old `const stats = params.store.getStatistics(params.projectRoot);` and the old final `prependTrustHeader(...)` call. Existing body renderers and `toAnchoredNeighbor(...)` continue to emit row-level `[stale]` markers.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-freshness-report.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
