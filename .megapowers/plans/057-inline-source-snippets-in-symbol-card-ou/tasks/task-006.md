---
id: 6
title: symbolCard — add Source section with hashlined content
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/symbol-card.ts
files_to_create:
  - test/tool-symbol-card-source.test.ts
---

### Task 6: symbolCard — add Source section with hashlined content [depends: 1]

**Files:**
- Modify: `src/tools/symbol-card.ts`
- Create: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-card-source.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard includes ### Source section with hashlined content", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "// header\nexport function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:2",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 2,
      end_line: 4,
      content_hash: hash,
      is_exported: true,
      signature: "() => number",
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    // Should contain Source section
    expect(output).toContain("### Source");
    // Should contain hashlined content
    expect(output).toMatch(/2:[a-f0-9]+\|export function foo/);
    expect(output).toMatch(/3:[a-f0-9]+\|  return 1;/);
    expect(output).toMatch(/4:[a-f0-9]+\|}/);

    // Source should appear before Signature
    const sourceIdx = output.indexOf("### Source");
    const sigIdx = output.indexOf("### Signature");
    expect(sourceIdx).toBeGreaterThan(-1);
    expect(sigIdx).toBeGreaterThan(-1);
    expect(sourceIdx).toBeLessThan(sigIdx);

    // Existing sections still present
    expect(output).toContain("## foo (function)");
    expect(output).toContain("### Exported");
    expect(output).toContain("### Signals");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected "### Source" to be in the output`

**Step 3 — Write minimal implementation**

Modify `src/tools/symbol-card.ts`:

```typescript
import type { GraphStore, NeighborResult } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatRoleTags } from "../output/signals.js";
import { readSourceSnippet } from "../output/source.js";
import { prependTrustHeader } from "../output/trust.js";

export interface SymbolCardParams {
  name: string;
  file?: string;
  maxSourceLines?: number;
  store: GraphStore;
  projectRoot: string;
}

export function symbolCard(params: SymbolCardParams): string {
  const { name, file, store, projectRoot, maxSourceLines } = params;
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
  const allNeighbors = store.getNeighbors(node.id).filter(
    (nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"),
  );

  const lines: string[] = [];

  // Header
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(anchor.anchor);

  // Source
  const snippet = readSourceSnippet(node, projectRoot, maxSourceLines);
  lines.push("");
  lines.push("### Source");
  if (snippet) {
    if (snippet.stale) {
      lines[lines.length - 1] = "### Source [stale]";
    }
    lines.push(snippet.text);
  } else {
    lines.push("source unavailable");
  }

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
  return prependTrustHeader(body, { stats, hasLocalExceptions: anchor.stale || (snippet?.stale ?? false) });
}

function formatRelGroup(label: string, neighbors: NeighborResult[]): string {
  const names = neighbors.slice(0, 5).map((nr) => nr.node.name);
  const suffix = neighbors.length > 5 ? ` (+${neighbors.length - 5} more)` : "";
  return `  ${label} (${neighbors.length}):  ${names.join(", ")}${suffix}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 381 tests passing
