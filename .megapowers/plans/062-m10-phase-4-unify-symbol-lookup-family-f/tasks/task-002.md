---
id: 2
title: Extract shared legacy neighborhood renderer
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/symbol-graph.ts
files_to_create:
  - test/tool-symbol-graph-render-neighborhood-body.test.ts
---

### Task 2: Extract shared legacy neighborhood renderer [depends: 1]

Covers AC 2, AC 10, AC 22.

**Files:**
- Modify: `src/tools/symbol-graph.ts`
- Test: `test/tool-symbol-graph-render-neighborhood-body.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-render-neighborhood-body.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
import { renderLegacyNeighborhoodBody, symbolGraph } from "../src/tools/symbol-graph.js";

test("renderLegacyNeighborhoodBody is exported and matches the current standalone neighborhood output", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-body-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
  writeFileSync(join(projectRoot, "src/b.ts"), "export function bar() {\n  return 1;\n}\n");

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex("import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
    const hashB = sha256Hex("export function bar() {\n  return 1;\n}\n");

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB, is_exported: true });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const rendered = renderLegacyNeighborhoodBody({ name: "foo", store, projectRoot });
    const standaloneBody = suppressFreshTrustHeader(symbolGraph({ name: "foo", store, projectRoot }));

    expect(standaloneBody).toBe(rendered.body);
    expect(rendered.body).toContain("### Callees");
    expect(rendered.body).toContain("bar");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-render-neighborhood-body.test.ts`
Expected: FAIL — `SyntaxError: Export named 'renderLegacyNeighborhoodBody' not found in module '../src/tools/symbol-graph.js'`

**Step 3 — Write minimal implementation**
In `src/tools/symbol-graph.ts`, extract the existing neighborhood-building path into a shared export and keep `symbolGraph()` temporarily delegating to it for the base body:

```ts
export interface RenderedSymbolNeighborhood {
  body: string;
  hasLocalExceptions: boolean;
}

export function renderLegacyNeighborhoodBody(params: SymbolGraphParams): RenderedSymbolNeighborhood {
  const { name, file, limit = 10, store, projectRoot } = params;
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return { body: `Symbol "${name}" not found`, hasLocalExceptions: false };
  }

  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    return { body: `${lines.join("\n")}\n`, hasLocalExceptions: lines.some((line) => line.includes("[stale]")) };
  }

  const node = nodes[0]!;
  const symbolAnchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const allNeighbors = store.getNeighbors(node.id);
  const computeSignals = (nodeId: string) => signalComputer.compute(nodeId);

  const buckets = new Map<string, NeighborResult[]>();
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of allNeighbors) {
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

  const namedSections: NamedSection[] = [];
  for (const title of sectionOrder) {
    const bucket = buckets.get(title);
    if (bucket && bucket.length > 0) {
      namedSections.push({ title, section: buildSection(bucket, limit, projectRoot, store, computeSignals) });
      buckets.delete(title);
    }
  }

  for (const [title, bucket] of buckets) {
    if (bucket.length > 0) {
      namedSections.push({ title, section: buildSection(bucket, limit, projectRoot, store, computeSignals) });
    }
  }

  if (unresolvedResults.length > 0) {
    namedSections.push({ title: "Unresolved", section: buildSection(unresolvedResults, limit, projectRoot, store) });
  }

  return {
    body: formatNeighborhood(
      { name: node.name, kind: node.kind, anchor: symbolAnchor, signals: signalComputer.compute(node.id) },
      namedSections,
    ),
    hasLocalExceptions: symbolAnchor.stale || namedSections.some((ns) => hasStaleItems(ns.section)),
  };
}

export function symbolGraph(params: SymbolGraphParams): string {
  const stats = params.store.getStatistics(params.projectRoot);
  const rendered = renderLegacyNeighborhoodBody(params);
  return prependTrustHeader(rendered.body, { stats, hasLocalExceptions: rendered.hasLocalExceptions });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-render-neighborhood-body.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
