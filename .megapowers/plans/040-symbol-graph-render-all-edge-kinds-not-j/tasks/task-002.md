---
id: 2
title: Generalize symbolGraph neighbor loop to categorize all edge kinds with
  direction-aware titles
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/symbol-graph.ts
files_to_create:
  - test/tool-symbol-graph-all-edge-kinds.test.ts
---

**AC coverage:** AC 1, AC 2, AC 3, AC 6, AC 7, AC 8

**Files:**
- Modify: `src/tools/symbol-graph.ts`
- Create: `test/tool-symbol-graph-all-edge-kinds.test.ts`

**Step 1 — Write the failing test**

Create `test/tool-symbol-graph-all-edge-kinds.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function setupFixture(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-alledge-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  writeFileSync(
    join(projectRoot, "src/a.ts"),
    "export interface IFoo {\n  doStuff(): void;\n}\n",
  );
  writeFileSync(
    join(projectRoot, "src/b.ts"),
    "export class FooImpl implements IFoo {\n  doStuff() {}\n}\n",
  );
  writeFileSync(
    join(projectRoot, "src/c.ts"),
    "export class ChildClass extends FooImpl {}\n",
  );
  writeFileSync(
    join(projectRoot, "src/test.ts"),
    "test('foo', () => {});\n",
  );
  writeFileSync(
    join(projectRoot, "src/cochange.ts"),
    "export function coFn() {}\n",
  );
  writeFileSync(
    join(projectRoot, "src/render.ts"),
    "export function MyComponent() {}\n",
  );
  writeFileSync(
    join(projectRoot, "src/route.ts"),
    "export function getHandler() {}\n",
  );

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

function getHash(projectRoot: string, file: string): string {
  const { sha256Hex } = require("../src/indexer/tree-sitter.js");
  const content = require("node:fs").readFileSync(join(projectRoot, file), "utf-8");
  return sha256Hex(content);
}

test("symbolGraph renders implements edges with direction-aware titles", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashB = getHash(projectRoot, "src/b.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: hashB });

    store.addEdge({
      source: "src/b.ts::FooImpl:1",
      target: "src/a.ts::IFoo:1",
      kind: "implements",
      provenance: { source: "lsp", confidence: 0.9, evidence: "implements clause", content_hash: hashB },
      created_at: Date.now(),
    });

    // Query the interface — incoming implements → "Implemented By"
    const ifaceOutput = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(ifaceOutput).toContain("### Implemented By");
    expect(ifaceOutput).toContain("FooImpl");

    // Query the class — outgoing implements → "Implements"
    const classOutput = symbolGraph({ name: "FooImpl", store, projectRoot });
    expect(classOutput).toContain("### Implements");
    expect(classOutput).toContain("IFoo");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph renders extends edges with direction-aware titles", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashB = getHash(projectRoot, "src/b.ts");
    const hashC = getHash(projectRoot, "src/c.ts");

    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: hashB });
    store.addNode({ id: "src/c.ts::ChildClass:1", kind: "class", name: "ChildClass", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: hashC });

    store.addEdge({
      source: "src/c.ts::ChildClass:1",
      target: "src/b.ts::FooImpl:1",
      kind: "extends",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "extends clause", content_hash: hashC },
      created_at: Date.now(),
    });

    // Query FooImpl — incoming extends → "Extended By"
    const parentOutput = symbolGraph({ name: "FooImpl", store, projectRoot });
    expect(parentOutput).toContain("### Extended By");
    expect(parentOutput).toContain("ChildClass");

    // Query ChildClass — outgoing extends → "Extends"
    const childOutput = symbolGraph({ name: "ChildClass", store, projectRoot });
    expect(childOutput).toContain("### Extends");
    expect(childOutput).toContain("FooImpl");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph renders tested_by edges with direction-aware titles", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashTest = getHash(projectRoot, "src/test.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/test.ts::fooTest:1", kind: "test", name: "fooTest", file: "src/test.ts", start_line: 1, end_line: 1, content_hash: hashTest });

    store.addEdge({
      source: "src/test.ts::fooTest:1",
      target: "src/a.ts::IFoo:1",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.7, evidence: "coverage data", content_hash: hashTest },
      created_at: Date.now(),
    });

    // Query IFoo — incoming tested_by → "Tested By"
    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(output).toContain("### Tested By");
    expect(output).toContain("fooTest");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph renders co_changes_with edges as Co-changes With", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashCo = getHash(projectRoot, "src/cochange.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/cochange.ts::coFn:1", kind: "function", name: "coFn", file: "src/cochange.ts", start_line: 1, end_line: 1, content_hash: hashCo });

    store.addEdge({
      source: "src/a.ts::IFoo:1",
      target: "src/cochange.ts::coFn:1",
      kind: "co_changes_with",
      provenance: { source: "git", confidence: 0.6, evidence: "co-change", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(output).toContain("### Co-changes With");
    expect(output).toContain("coFn");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph renders renders and routes_to edges", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashRender = getHash(projectRoot, "src/render.ts");
    const hashRoute = getHash(projectRoot, "src/route.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/render.ts::MyComponent:1", kind: "function", name: "MyComponent", file: "src/render.ts", start_line: 1, end_line: 1, content_hash: hashRender });
    store.addNode({ id: "src/route.ts::getHandler:1", kind: "function", name: "getHandler", file: "src/route.ts", start_line: 1, end_line: 1, content_hash: hashRoute });

    // IFoo renders MyComponent (outgoing)
    store.addEdge({
      source: "src/a.ts::IFoo:1",
      target: "src/render.ts::MyComponent:1",
      kind: "renders",
      provenance: { source: "ast-grep", confidence: 0.7, evidence: "JSX render", content_hash: hashA },
      created_at: Date.now(),
    });

    // IFoo routes_to getHandler (outgoing)
    store.addEdge({
      source: "src/a.ts::IFoo:1",
      target: "src/route.ts::getHandler:1",
      kind: "routes_to",
      provenance: { source: "ast-grep", confidence: 0.7, evidence: "express route", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(output).toContain("### Renders");
    expect(output).toContain("MyComponent");
    expect(output).toContain("### Routes To");
    expect(output).toContain("getHandler");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph stale check covers all edge kind sections", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    // Use wrong hash for stale node
    const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: staleHash });

    store.addEdge({
      source: "src/b.ts::FooImpl:1",
      target: "src/a.ts::IFoo:1",
      kind: "implements",
      provenance: { source: "lsp", confidence: 0.9, evidence: "impl", content_hash: staleHash },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    // The stale node in the implements section should trigger [stale] marker
    expect(output).toContain("[stale]");
    // Trust header should mention staleness
    expect(output).toContain("stale");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph output line format is unchanged — anchor name edgeKind confidence source", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashB = getHash(projectRoot, "src/b.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: hashB });

    store.addEdge({
      source: "src/b.ts::FooImpl:1",
      target: "src/a.ts::IFoo:1",
      kind: "implements",
      provenance: { source: "lsp", confidence: 0.9, evidence: "impl", content_hash: hashB },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    // Find the line with FooImpl — should have standard format
    const implLine = output.split("\n").find((l: string) => l.includes("FooImpl"));
    expect(implLine).toBeDefined();
    expect(implLine).toContain("implements");
    expect(implLine).toContain("confidence:0.9");
    expect(implLine).toContain("lsp");

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-symbol-graph-all-edge-kinds.test.ts`

Expected: FAIL — the current `symbolGraph()` drops implements/extends/tested_by/co_changes_with/renders/routes_to edges, so output will not contain `### Implemented By`, `### Extends`, etc.

**Step 3 — Write minimal implementation**

Replace the `symbolGraph` function body in `src/tools/symbol-graph.ts` (lines 66-134). The new implementation:

```typescript
import type { GraphStore, NeighborResult } from "../graph/store.js";
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  type AnchoredNeighbor,
  type NeighborSection,
  type NamedSection,
} from "../output/anchoring.js";
import { createSignalComputer, type NodeSignals } from "../output/signals.js";
import { prependTrustHeader } from "../output/trust.js";

export interface SymbolGraphParams {
  name: string;
  file?: string;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}

function isAgentEdgeStale(nr: NeighborResult, store: GraphStore): boolean {
  if (nr.edge.provenance.source !== "agent") return false;
  const sourceNode = store.getNode(nr.edge.source);
  if (!sourceNode) return true;
  const currentFileHash = store.getFileHash(sourceNode.file);
  if (!currentFileHash) return true;
  return nr.edge.provenance.content_hash !== currentFileHash;
}

function toAnchoredNeighbor(
  nr: NeighborResult,
  projectRoot: string,
  store: GraphStore,
  computeSignals?: (nodeId: string) => NodeSignals,
): AnchoredNeighbor {
  const anchor = computeAnchor(nr.node, projectRoot);
  const agentStale = isAgentEdgeStale(nr, store);
  const effectiveAnchor = agentStale ? { ...anchor, stale: true } : anchor;
  return {
    anchor: effectiveAnchor,
    name: nr.node.name,
    edgeKind: nr.edge.kind,
    confidence: nr.edge.provenance.confidence,
    provenanceSource: nr.edge.provenance.source,
    signals: computeSignals ? computeSignals(nr.node.id) : undefined,
  };
}

function buildSection(
  neighbors: NeighborResult[],
  limit: number,
  projectRoot: string,
  store: GraphStore,
  computeSignals?: (nodeId: string) => NodeSignals,
): NeighborSection {
  const ranked = rankNeighbors(neighbors, limit);
  return {
    items: ranked.kept.map((nr) => toAnchoredNeighbor(nr, projectRoot, store, computeSignals)),
    omitted: ranked.omitted,
  };
}

function hasStaleItems(section: NeighborSection): boolean {
  return section.items.some((item) => item.anchor.stale);
}

/** Map (edgeKind, direction) to a human-readable section title. */
function sectionTitle(edgeKind: string, direction: "in" | "out"): string {
  switch (edgeKind) {
    case "calls":
      return direction === "in" ? "Callers" : "Callees";
    case "imports":
      return direction === "in" ? "Imported By" : "Imports";
    case "implements":
      return direction === "in" ? "Implemented By" : "Implements";
    case "extends":
      return direction === "in" ? "Extended By" : "Extends";
    case "tested_by":
      return direction === "in" ? "Tested By" : "Tests";
    case "co_changes_with":
      return "Co-changes With";
    case "renders":
      return direction === "in" ? "Rendered By" : "Renders";
    case "routes_to":
      return direction === "in" ? "Routed From" : "Routes To";
    default: {
      // Future-proofing: derive a title from the kind string
      const label = edgeKind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return direction === "in" ? `${label} (incoming)` : `${label} (outgoing)`;
    }
  }
}

export function symbolGraph(params: SymbolGraphParams): string {
  const { name, file, limit = 10, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return prependTrustHeader(`Symbol "${name}" not found`, { stats });
  }

  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    const hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
    return prependTrustHeader(body, { stats, hasLocalExceptions });
  }

  const node = nodes[0]!;
  const symbolAnchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const allNeighbors = store.getNeighbors(node.id);
  const computeSignals = (nodeId: string) => signalComputer.compute(nodeId);

  // Bucket neighbors by (sectionTitle) key
  const buckets = new Map<string, NeighborResult[]>();
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of allNeighbors) {
    if (nr.node.file.startsWith("__unresolved__")) {
      unresolvedResults.push(nr);
      continue;
    }

    const direction = nr.edge.target === node.id ? "in" : "out";
    const title = sectionTitle(nr.edge.kind, direction);
    let bucket = buckets.get(title);
    if (!bucket) {
      bucket = [];
      buckets.set(title, bucket);
    }
    bucket.push(nr);
  }

  // Build named sections in a stable order
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

  // Known sections in defined order
  for (const title of sectionOrder) {
    const bucket = buckets.get(title);
    if (bucket && bucket.length > 0) {
      namedSections.push({
        title,
        section: buildSection(bucket, limit, projectRoot, store, computeSignals),
      });
      buckets.delete(title);
    }
  }

  // Any remaining (unknown edge kinds) appended at end
  for (const [title, bucket] of buckets) {
    if (bucket.length > 0) {
      namedSections.push({
        title,
        section: buildSection(bucket, limit, projectRoot, store, computeSignals),
      });
    }
  }

  // Unresolved always last
  if (unresolvedResults.length > 0) {
    namedSections.push({
      title: "Unresolved",
      section: buildSection(unresolvedResults, limit, projectRoot, store),
    });
  }

  const body = formatNeighborhood(
    { name: node.name, kind: node.kind, anchor: symbolAnchor, signals: signalComputer.compute(node.id) },
    namedSections,
  );

  const hasLocalExceptions = symbolAnchor.stale
    || namedSections.some((ns) => hasStaleItems(ns.section));

  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-symbol-graph-all-edge-kinds.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing (existing symbol-graph tests still pass because callers/callees/imports/unresolved behavior is preserved)
