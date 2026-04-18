---
id: 1
title: Extract shared compact card renderer
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/symbol-card.ts
files_to_create:
  - test/tool-symbol-card-render-body.test.ts
---

### Task 1: Extract shared compact card renderer

Covers AC 2, AC 5, AC 6, AC 7, AC 22.
**Files:**
- Modify: `src/tools/symbol-card.ts`
- Test: `test/tool-symbol-card-render-body.test.ts`
**Design note (responds to review):**
- `renderSymbolCardBody()` is the new **compact base view only** — identity/header, signature, covering tests, key relationships, and signals. It does **not** emit `### Source` or `### Exported`.
- `symbolCard()` is **not** converted to a thin wrapper in this task. It keeps its existing standalone output shape (including `### Source` and `### Exported`) so the existing internal tests under `test/tool-symbol-card-*.test.ts` (e.g. `tool-symbol-card-happy.test.ts`, `tool-symbol-card-source.test.ts`) stay green.
- We therefore do **not** assert that `symbolCard()` and `renderSymbolCardBody()` are byte-identical. Task 3 will use the compact helper as the default `symbol_graph` base, which is why AC 6 / AC 7 require absence of `### Exported` and `### Source` by default.
**Step 1 — Write the failing test**
Create `test/tool-symbol-card-render-body.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { renderSymbolCardBody } from "../src/tools/symbol-card.js";

test("renderSymbolCardBody returns the compact card base view without Source or Exported", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-body-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
  const fileBContent = "export function bar() {\n  return 1;\n}\n";
  const testContent = "test('foo works', () => {});\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  writeFileSync(join(projectRoot, "test/foo.test.ts"), testContent);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);
    const hashTest = sha256Hex(testContent);
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true, signature: "() => void" });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB, is_exported: true, signature: "() => number" });
    store.addNode({ id: "test/foo.test.ts::foo works:1", kind: "test", name: "foo works", file: "test/foo.test.ts", start_line: 1, end_line: 1, content_hash: hashTest });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "test/foo.test.ts::foo works:1",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: hashA },
      created_at: Date.now(),
    });

    const rendered = renderSymbolCardBody({ name: "foo", store, projectRoot });
    expect(rendered.body).toContain("## foo (function)");
    expect(rendered.body).toContain("### Signature");
    expect(rendered.body).toContain("### Covering Tests");
    expect(rendered.body).toContain("### Key Relationships");
    expect(rendered.body).toContain("### Signals");
    expect(rendered.body).not.toContain("### Source");
    expect(rendered.body).not.toContain("### Exported");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-render-body.test.ts`
Expected: FAIL — `SyntaxError: Export named 'renderSymbolCardBody' not found in module '.../src/tools/symbol-card.ts'`
**Step 3 — Write minimal implementation**
In `src/tools/symbol-card.ts`, **add** a new exported `renderSymbolCardBody()` that emits only the compact base view (identity, signature, covering tests, key relationships, signals). Do **not** modify the existing `symbolCard()` function — it must continue to emit its current standalone output shape (including `### Source` and `### Exported`) so `test/tool-symbol-card-*.test.ts` stays green.

```ts
export interface RenderedSymbolCard {
  body: string;
  hasLocalExceptions: boolean;
}
export function renderSymbolCardBody(params: SymbolCardParams): RenderedSymbolCard {
  const { name, file, store, projectRoot } = params;
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
    const body = `${lines.join("\n")}\n`;
    return { body, hasLocalExceptions: lines.some((line) => line.includes("[stale]")) };
  }
  const node = nodes[0]!;
  const anchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const signals = signalComputer.compute(node.id);
  const allNeighbors = store.getNeighbors(node.id).filter(
    (nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"),
  );
  const lines: string[] = [];
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(anchor.anchor);
  lines.push("");
  lines.push("### Signature");
  lines.push(node.signature ?? "not available");


  const tests = allNeighbors.filter((nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id);
  if (tests.length > 0) {
    lines.push("");
    lines.push(`### Covering Tests (${tests.length})`);
    for (const t of tests) {
      const testAnchor = computeAnchor(t.node, projectRoot);
      lines.push(`  ${testAnchor.anchor}  "${t.node.name}"`);
    }
  }
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

  lines.push("");
  lines.push("### Signals");
  lines.push(formatRoleTags(signals));


  return {
    body: lines.join("\n") + "\n",
    hasLocalExceptions: anchor.stale,
  };
}
```

Keep the existing `symbolCard()` function body unchanged in this task. A later task (Task 6) refactors its source-section internals to share `renderSymbolSourceSection()` while preserving the standalone output shape.
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-render-body.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing (all existing `test/tool-symbol-card-*.test.ts` stay green because `symbolCard()` is unchanged in this task).
