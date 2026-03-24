---
id: 3
title: symbolCard renders full card for single match with signature and relationships
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/tools/symbol-card.ts
files_to_create:
  - test/tool-symbol-card-happy.test.ts
---

**Files:**
- Modify: `src/tools/symbol-card.ts`
- Test: `test/tool-symbol-card-happy.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-happy.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard renders full card with signature, relationships, and signals", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-happy-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
  const fileBContent = "export function bar() {\n  return 1;\n}\n";
  const testContent = "test('foo works', () => {});\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  writeFileSync(join(projectRoot, "test/foo.test.ts"), testContent);

  try {
    const store = new SqliteGraphStore();
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);
    const hashTest = sha256Hex(testContent);

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true, signature: "(bar: Bar) => void" });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });
    store.addNode({ id: "test/foo.test.ts::foo works:1", kind: "test", name: "foo works", file: "test/foo.test.ts", start_line: 1, end_line: 1, content_hash: hashTest });

    // foo calls bar
    store.addEdge({
      source: "src/a.ts::foo:3", target: "src/b.ts::bar:1", kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });
    // foo imports bar
    store.addEdge({
      source: "src/a.ts::foo:3", target: "src/b.ts::bar:1", kind: "imports",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hashA },
      created_at: Date.now(),
    });
    // foo tested_by test
    store.addEdge({
      source: "src/a.ts::foo:3", target: "test/foo.test.ts::foo works:1", kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    // Header
    expect(output).toContain("## Trust");
    expect(output).toContain("## foo (function)");
    expect(output).toContain("src/a.ts:3:");

    // Signature
    expect(output).toContain("### Signature");
    expect(output).toContain("(bar: Bar) => void");

    // Exported
    expect(output).toContain("### Exported");
    expect(output).toContain("yes");

    // Covering Tests
    expect(output).toContain("### Covering Tests");
    expect(output).toContain("foo works");

    // Key Relationships
    expect(output).toContain("### Key Relationships");
    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    expect(output).toContain("Imports");

    // Signals
    expect(output).toContain("### Signals");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-happy.test.ts`
Expected: FAIL — expect(received).toContain(expected) — Expected string to contain "## foo (function)"

**Step 3 — Write minimal implementation**

Replace the full `src/tools/symbol-card.ts`:

```ts
// src/tools/symbol-card.ts
import type { GraphStore, NeighborResult } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatRoleTags } from "../output/signals.js";
import { prependTrustHeader } from "../output/trust.js";

export interface SymbolCardParams {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}

export function symbolCard(params: SymbolCardParams): string {
  const { name, file, store, projectRoot } = params;
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
  const anchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const signals = signalComputer.compute(node.id);
  const allNeighbors = store.getNeighbors(node.id);

  const lines: string[] = [];

  // Header
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(anchor.anchor);

  // Signature
  lines.push("");
  lines.push("### Signature");
  lines.push(node.signature ?? "not available");

  // Exported
  lines.push("");
  lines.push("### Exported");
  lines.push(node.is_exported ? "yes" : "no");

  // Covering Tests
  const tests = allNeighbors.filter(
    (nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id,
  );
  if (tests.length > 0) {
    lines.push("");
    lines.push(`### Covering Tests (${tests.length})`);
    for (const t of tests) {
      const testAnchor = computeAnchor(t.node, projectRoot);
      lines.push(`  ${testAnchor.anchor}  "${t.node.name}"`);
    }
  }

  // Key Relationships
  const callers = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.target === node.id);
  const callees = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.source === node.id);
  const imports = allNeighbors.filter((nr) => nr.edge.kind === "imports" && nr.edge.source === node.id);
  const extendsOut = allNeighbors.filter((nr) => nr.edge.kind === "extends" && nr.edge.source === node.id);
  const implementsOut = allNeighbors.filter((nr) => nr.edge.kind === "implements" && nr.edge.source === node.id);

  const relSections: string[] = [];
  if (callers.length > 0) relSections.push(formatRelGroup("Callers", callers));
  if (callees.length > 0) relSections.push(formatRelGroup("Callees", callees));
  if (imports.length > 0) relSections.push(formatRelGroup("Imports", imports));
  if (extendsOut.length > 0) relSections.push(formatRelGroup("Extends", extendsOut));
  if (implementsOut.length > 0) relSections.push(formatRelGroup("Implements", implementsOut));

  if (relSections.length > 0) {
    lines.push("");
    lines.push("### Key Relationships");
    lines.push(...relSections);
  }

  // Signals
  lines.push("");
  lines.push("### Signals");
  lines.push(formatRoleTags(signals));

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats, hasLocalExceptions: anchor.stale });
}

function formatRelGroup(label: string, neighbors: NeighborResult[]): string {
  const names = neighbors.slice(0, 5).map((nr) => nr.node.name);
  const suffix = neighbors.length > 5 ? ` (+${neighbors.length - 5} more)` : "";
  return `  ${label} (${neighbors.length}):  ${names.join(", ")}${suffix}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-happy.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
