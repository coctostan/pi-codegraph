# Plan

### Task 1: Extract shared compact card renderer

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

### Task 2: Extract shared legacy neighborhood renderer [depends: 1]

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

### Task 3: Make symbol_graph default to compact card [depends: 1, 2]

### Task 3: Make symbol_graph default to compact card [depends: 1, 2]

Covers AC 3, AC 4, AC 5, AC 6, AC 7, AC 12, AC 13, AC 17, AC 18, AC 22.

**Scope note (responds to review):**
- This task switches **base selection only**. The contract-append block in `src/tools/symbol-graph.ts` already exists and stays intact — Task 3 does not introduce or modify contract-append behavior.
- Coverage for AC 12 / AC 13 remains in the existing `test/tool-symbol-graph-contract-include.test.ts` assertions that require the appended contract section to start after the active base and to match `renderSymbolContractBody(...).body`.
- Direct `symbolGraph(...)` call sites and the three registered-tool `exec!` call sites in `test/tool-symbol-graph-lsp.test.ts` that still assert legacy neighborhood sections are migrated to `include: ["neighborhood"]` in this task so the full suite stays green after the default-base flip.
**Files:**
- Modify: `src/tools/symbol-graph.ts`
- Modify: `test/tool-symbol-graph-include-schema.test.ts`
- Create: `test/tool-symbol-graph-default-card.test.ts`
- Modify: `test/tool-symbol-graph.test.ts`
- Modify: `test/tool-symbol-graph-signals.test.ts`
- Modify: `test/tool-symbol-graph-trust-header.test.ts`
- Modify: `test/tool-symbol-graph-no-bolt-on.test.ts`
- Modify: `test/tool-symbol-graph-unknown-edge-kind.test.ts`
- Modify: `test/tool-symbol-graph-stale-agent.test.ts`
- Modify: `test/tool-symbol-graph-all-edge-kinds.test.ts`
- Modify: `test/tool-symbol-graph-lsp.test.ts`
- Modify: `test/repro-039-self-referential-dedup.test.ts`
- Modify: `test/readonly-graceful-degradation.test.ts`
**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-default-card.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph defaults to a compact card and include:[] matches omitted include", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-card-${Date.now()}`);
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
    const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
    const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });

    expect(withoutInclude).toBe(withEmptyInclude);
    expect(withoutInclude).toContain("## foo (function)");
    expect(withoutInclude).toContain("### Signature");
    expect(withoutInclude).toContain("### Covering Tests");
    expect(withoutInclude).toContain("### Key Relationships");
    expect(withoutInclude).toContain("### Signals");
    expect(withoutInclude).not.toContain("### Exported");
    expect(withoutInclude).not.toContain("### Contract");
    expect(withoutInclude).not.toContain("### Source");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
test("symbolGraph keeps not-found and ambiguous handling explicit in the default card base", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-card-empty-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function foo() {}\n");
  writeFileSync(join(projectRoot, "src/b.ts"), "export class foo {}\n");
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex("export function foo() {}\n");
    const hashB = sha256Hex("export class foo {}\n");
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB });

    expect(symbolGraph({ name: "doesNotExist", store, projectRoot })).toContain('Symbol "doesNotExist" not found');
    const ambiguous = symbolGraph({ name: "foo", store, projectRoot });
    expect(ambiguous).toContain('Multiple matches for "foo"');
    expect(ambiguous).toContain("src/a.ts");
    expect(ambiguous).toContain("src/b.ts");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Also update the existing neighborhood-oriented tests listed above so each direct `symbolGraph(...)` call that expects the old sectioned graph explicitly requests it with `include: ["neighborhood"] as any`. For example, in `test/tool-symbol-graph.test.ts` replace:

```ts
const output = symbolGraph({ name: "foo", store, projectRoot });
```

with:

```ts
const output = symbolGraph({ name: "foo", include: ["neighborhood"] as any, store, projectRoot });
```

Make the same explicit-legacy change everywhere those files assert `### Callers`, `### Callees`, omitted-neighbor counts, trust-header neighborhood rows, or edge-kind sections.

In `test/tool-symbol-graph-lsp.test.ts`, update the three registered-tool execute calls that still assert legacy neighborhood sections so they explicitly request the legacy base:

```ts
const result = await exec!(
  "tc1",
  { name: "shared", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

```ts
const result = await exec!(
  "tc-intf",
  { name: "IWorker", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

```ts
const result2 = await exec!(
  "tc-a2",
  { name: "IWorker", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

In `test/tool-symbol-graph-include-schema.test.ts`, keep the schema checks unchanged in this task, but replace the old exact-string assertion block with explicit compact-card assertions:

```ts
const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
expect(withoutInclude).toContain("## foo (function)");
expect(withoutInclude).toContain("### Signature");
expect(withoutInclude).toContain("### Signals");

const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });
expect(withEmptyInclude).toBe(withoutInclude);
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-default-card.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` for `"### Signature"` — the default `symbolGraph()` output currently emits the legacy neighborhood view (`### Callees`, `### Callers`, etc.) rather than the compact card.
**Step 3 — Write minimal implementation**
In `src/tools/symbol-graph.ts`, switch the base output selection so omitted `include` and `include: []` use the shared compact card renderer from Task 1, while `include` containing `"neighborhood"` uses the legacy renderer from Task 2. Keep the existing contract-append block at `src/tools/symbol-graph.ts:191-195` exactly as-is:

```ts
import { renderSymbolCardBody } from "./symbol-card.js";
import { renderSymbolContractBody } from "./symbol-contract.js";


export interface SymbolGraphParams {
  name: string;
  file?: string;
  include?: Array<"neighborhood" | "contract" | "source">;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}
export function symbolGraph(params: SymbolGraphParams): string {
  const { include } = params;
  const stats = params.store.getStatistics(params.projectRoot);


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
  let hasLocalExceptions = base.hasLocalExceptions;
  // Existing contract-append block — leave untouched.
  if ((include ?? []).includes("contract")) {
    const rendered = renderSymbolContractBody({
      name: params.name,
      file: params.file,
      store: params.store,
      projectRoot: params.projectRoot,
    });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
    hasLocalExceptions = hasLocalExceptions || rendered.hasLocalExceptions;
  }
  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
```

This task does **not** introduce new contract behavior. It only flips the base from neighborhood to compact card when `"neighborhood"` is absent from `include`, while keeping the existing contract-append tests green.

Do not broaden the schema checks in `test/tool-symbol-graph-include-schema.test.ts` yet; Task 4 owns that change.
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-default-card.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Validate include values and preserve legacy neighborhood output [depends: 2, 3]

### Task 4: Validate include values and preserve legacy neighborhood output [depends: 2, 3]

Covers AC 8, AC 9, AC 10, AC 11, AC 22.

**Scope note (responds to review):**
- This task is the schema-widening follow-up to Task 3. It broadens the registered-tool `include` schema/cast and keeps `include: ["neighborhood"]` byte-identical to the legacy standalone `symbolGraph()` body.
- This task also updates the existing `test/tool-symbol-graph-include-schema.test.ts` file so its schema assertions match the widened `"neighborhood" | "contract" | "source"` runtime surface.
**Files:**
- Modify: `src/index.ts`
- Modify: `src/tools/symbol-graph.ts`
- Modify: `test/tool-symbol-graph-include-schema.test.ts`
- Create: `test/tool-symbol-graph-legacy-neighborhood.test.ts`
**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-legacy-neighborhood.test.ts`:
```ts
import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
import { renderLegacyNeighborhoodBody, symbolGraph } from "../src/tools/symbol-graph.js";


test("symbol_graph schema accepts only neighborhood, contract, and source includes", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;


  resetStoreForTesting();
  piCodegraph(mockPi);


  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");


  const schema = tool.parameters as any;
  expect(Value.Check(schema, { name: "foo", include: ["neighborhood"] })).toBe(true);
  expect(Value.Check(schema, { name: "foo", include: ["contract"] })).toBe(true);
  expect(Value.Check(schema, { name: "foo", include: ["source"] })).toBe(true);
  expect(Value.Check(schema, { name: "foo", include: ["signals"] })).toBe(false);
  expect(Value.Check(schema, { name: "foo", include: ["wat"] })).toBe(false);
});
test("include:['neighborhood'] returns the byte-identical legacy body and stays the active base when combined", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-legacy-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
  writeFileSync(join(projectRoot, "src/b.ts"), "export function bar() {\n  return 1;\n}\n");


  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex("import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
    const hashB = sha256Hex("export function bar() {\n  return 1;\n}\n");


    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true, signature: "() => void" });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB, is_exported: true, signature: "() => number" });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });
    const expected = renderLegacyNeighborhoodBody({ name: "foo", store, projectRoot }).body;
    const neighborhood = suppressFreshTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood"] as any, store, projectRoot }));
    const combined = suppressFreshTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood", "contract"] as any, store, projectRoot }));


    expect(neighborhood).toBe(expected);
    expect(combined.startsWith(expected)).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-legacy-neighborhood.test.ts`
Expected: FAIL — Bun assertion failure `expect(received).toBe(expected)` reported against the schema checks. Specifically, with the current schema at `src/index.ts:25-34` that accepts only `Type.Literal("contract")`, `Value.Check(schema, { name: "foo", include: ["neighborhood"] })` returns `false` (so `expect(false).toBe(true)` fails) and `Value.Check(schema, { name: "foo", include: ["source"] })` likewise returns `false`.
**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the `SymbolGraphParams` include schema at `src/index.ts:25-34` with the broadened union:

```ts
const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  include: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("neighborhood"),
        Type.Literal("contract"),
        Type.Literal("source"),
      ]),
      { description: "Optional extra sections to append to the response" },
    ),
  ),
});
```

Also update the registered-tool execute path so the `include` cast matches the new runtime surface. At `src/index.ts:212`, replace:

```ts
include: params.include as Array<"contract"> | undefined,
```

with:

```ts
include: params.include as Array<"neighborhood" | "contract" | "source"> | undefined,
```

In `src/tools/symbol-graph.ts`, keep `renderLegacyNeighborhoodBody()` unchanged and ensure `symbolGraph()` only switches to that base when `include` contains `"neighborhood"` (this is already the shape introduced in Task 3).
Then update the existing schema assertions in `test/tool-symbol-graph-include-schema.test.ts` so they match the widened include surface. Replace the old negative check for `include: ["neighborhood"]` with concrete positive/negative checks such as:

```ts
if (!Value.Check(schema, { name: "foo", include: ["neighborhood"] })) {
  throw new Error('symbol_graph schema rejected include=["neighborhood"]');
}
if (!Value.Check(schema, { name: "foo", include: ["contract"] })) {
  throw new Error('symbol_graph schema rejected include=["contract"]');
}
if (!Value.Check(schema, { name: "foo", include: ["source"] })) {
  throw new Error('symbol_graph schema rejected include=["source"]');
}
if (Value.Check(schema, { name: "foo", include: ["signals"] })) {
  throw new Error('symbol_graph schema accepted include=["signals"]');
}
```

Keep the compact-card default-output assertions introduced in Task 3, but make sure the schema checks in this existing file now align with the broadened runtime schema.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-legacy-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Add automated docs drift test and update public docs for unified symbol_graph [depends: 3, 4]

### Task 5: Add automated docs drift test and update public docs for unified symbol_graph [depends: 3, 4]

Covers AC 20, AC 22.
**Scope note (responds to review):**
The previous Task 5 ("append contract sections") duplicated behavior that already exists in `src/tools/symbol-graph.ts:191-195`, so it had no credible RED. Per reviewer guidance on Task 5 ("merge the contract append regression coverage into Task 3 / Task 4" — done; contract-append block is now left intact by Task 3) and on Task 8 ("convert this into a tested docs task or add a paired task that owns the docs drift test"), this slot is **repurposed** to own the docs drift test plus the README / ARCHITECTURE / tool-description updates that AC 20 and AC 22 require.

Because the current `README.md` still documents `symbol_card` and `symbol_contract` as public tools, the drift test has a real, specific RED state.
**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/tool-descriptions.md`
- Create: `test/docs-symbol-graph-unified-surface.test.ts`
**Step 1 — Write the failing test**
Create `test/docs-symbol-graph-unified-surface.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("public docs describe symbol_graph as the unified lookup surface", () => {
  const readme = read("README.md");
  const architecture = read("ARCHITECTURE.md");
  const guide = read("docs/tool-descriptions.md");

  expect(readme).toContain('symbol_graph({ name: "validateToken" })');
  expect(readme).toContain('include: ["neighborhood"]');
  expect(readme).toContain('include: ["contract"]');
  expect(readme).toContain('include: ["source"]');
  expect(readme).not.toContain("#### `symbol_card`");
  expect(readme).not.toContain("#### `symbol_contract`");

  expect(architecture).toContain("symbol_graph");
  expect(architecture).not.toContain("symbol_card tool");
  expect(architecture).not.toContain("symbol_contract tool");

  expect(guide).toContain("5-tool default public surface");
  expect(guide).toContain("internal-only `symbol_search`");
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts`
Expected: FAIL — Bun first reports `expect(received).toContain(expected)` against `include: ["neighborhood"]` from `README.md`. The same test also remains red on the missing `include: ["source"]` example, the `"5-tool default public surface"` guide text, and the `README.md` / `ARCHITECTURE.md` `symbol_card` / `symbol_contract` references.
**Step 3 — Write minimal implementation**
Update the three docs files so the assertions above hold.

In `README.md`:
- Replace the 7-public-tools language with the 5 default public tools: `symbol_graph`, `resolve_edge`, `delete_edge`, `impact`, `trace`.
- Remove the standalone `#### `symbol_card`` and `#### `symbol_contract`` subsections entirely.
- Expand the `symbol_graph` subsection with these usage patterns (copy-pasteable example lines):
  - `symbol_graph({ name: "validateToken" })`
  - `symbol_graph({ name: "validateToken", include: ["neighborhood"] })`
  - `symbol_graph({ name: "validateToken", include: ["contract"] })`
  - `symbol_graph({ name: "validateToken", include: ["source"] })`
  - `symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })`
- Update the project-structure comments so `symbol-card.ts` and `symbol-contract.ts` are described as internal/shared rendering modules, not public tools.

In `ARCHITECTURE.md`:
- Update the system overview ASCII block so the public surface lists only `symbol_graph | resolve_edge | delete_edge | impact | trace`.
- Replace any `symbol_card tool` / `symbol_contract tool` prose so only `symbol_graph` is described as a public tool; reference `symbol-card.ts` / `symbol-contract.ts` as shared renderer modules used by `symbol_graph`.

In `docs/tool-descriptions.md`:
- Update the maintenance note so the source of truth reflects the `5-tool default public surface` plus dev-only tools and `internal-only `symbol_search``.
- Add a short note that `symbol_graph.include` usage belongs in README/schema docs, while top-level descriptions stay terse.
**Step 4 — Run test, verify it passes**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: Append source sections from the shared source renderer [depends: 1, 3, 4]

### Task 6: Append source sections from the shared source renderer [depends: 1, 3, 4]

Covers AC 2, AC 14, AC 15, AC 16, AC 17, AC 18, AC 22.
**Files:**
- Modify: `src/tools/symbol-card.ts`
- Modify: `src/tools/symbol-graph.ts`
- Create: `test/tool-symbol-graph-source-include.test.ts`
**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-source-include.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
import { renderLegacyNeighborhoodBody, symbolGraph } from "../src/tools/symbol-graph.js";
import { renderSymbolSourceSection, symbolCard } from "../src/tools/symbol-card.js";
function setupSourceFixture(): { projectRoot: string; store: SqliteGraphStore; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-sg-source-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const srcContent = "export function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src/foo.ts"), srcContent);


  const store = new SqliteGraphStore();
  const srcHash = sha256Hex(srcContent);
  store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 3, content_hash: srcHash, is_exported: true, signature: "() => number" });
  return {
    projectRoot,
    store,
    cleanup: () => {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}
test("include:['source'] appends the shared source section to the compact card base", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const base = symbolGraph({ name: "foo", store, projectRoot });
    const source = renderSymbolSourceSection({ name: "foo", store, projectRoot });
    const withSource = symbolGraph({ name: "foo", include: ["source"] as any, store, projectRoot });


    expect(withSource.startsWith(base)).toBe(true);
    expect(withSource.slice(base.length)).toBe(`\n${source.body}`);
    expect(withSource).not.toContain("### Source\n### Source");
  } finally {
    cleanup();
  }
});
test("include:['neighborhood','source'] keeps neighborhood as the active base and appends source after it", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const neighborhoodBody = renderLegacyNeighborhoodBody({ name: "foo", store, projectRoot }).body;
    const source = renderSymbolSourceSection({ name: "foo", store, projectRoot });
    const withSource = suppressFreshTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood", "source"] as any, store, projectRoot }));


    expect(withSource.startsWith(neighborhoodBody)).toBe(true);
    expect(withSource.slice(neighborhoodBody.length)).toBe(`\n${source.body}`);
  } finally {
    cleanup();
  }
});
test("include:['contract','source'] appends contract then source after the active base", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const withBoth = symbolGraph({ name: "foo", include: ["contract", "source"] as any, store, projectRoot });
    const contractIdx = withBoth.indexOf("## Contract: foo");
    const sourceIdx = withBoth.indexOf("### Source");


    expect(contractIdx).toBeGreaterThan(-1);
    expect(sourceIdx).toBeGreaterThan(contractIdx);
  } finally {
    cleanup();
  }
});

test("include:['source'] returns explicit not-found output", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const missing = symbolGraph({ name: "doesNotExist", include: ["source"] as any, store, projectRoot });
    expect(missing).toContain('Symbol "doesNotExist" not found');
  } finally {
    cleanup();
  }
});

test("include:['source'] returns explicit ambiguity output", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const dupContent = "export class foo {}\n";
    writeFileSync(join(projectRoot, "src/dup.ts"), dupContent);
    const dupHash = sha256Hex(dupContent);
    store.addNode({
      id: "src/dup.ts::foo:1",
      kind: "class",
      name: "foo",
      file: "src/dup.ts",
      start_line: 1,
      end_line: 1,
      content_hash: dupHash,
    });

    const ambiguous = symbolGraph({ name: "foo", include: ["source"] as any, store, projectRoot });
    expect(ambiguous).toContain('Multiple matches for "foo"');
    expect(ambiguous).toContain("src/foo.ts");
    expect(ambiguous).toContain("src/dup.ts");
  } finally {
    cleanup();
  }
});

test("symbolCard routes its Source section through renderSymbolSourceSection for AC 15", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const standalone = symbolCard({ name: "foo", store, projectRoot });
    const source = renderSymbolSourceSection({ name: "foo", store, projectRoot });

    // The shared helper body (e.g. `### Source\n<snippet>\n`) must appear inside the
    // standalone card output, proving symbolCard() now reuses the shared renderer.
    expect(standalone).toContain(source.body.trimEnd());
  } finally {
    cleanup();
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-source-include.test.ts`
Expected: FAIL — `SyntaxError: Export named 'renderSymbolSourceSection' not found in module '.../src/tools/symbol-card.ts'`
**Step 3 — Write minimal implementation**
In `src/tools/symbol-card.ts`, export a shared source-section renderer that reuses `readSourceSnippet()`, and **refactor `symbolCard()` to route its existing `### Source` block through this helper** so the standalone card output and the new `include: ["source"]` path share the same rendering code (AC 15):

```ts
export interface RenderedSymbolSection {
  body: string;
  hasLocalExceptions: boolean;
}
export function renderSymbolSourceSection(params: SymbolCardParams): RenderedSymbolSection {
  const { name, file, store, projectRoot, maxSourceLines } = params;
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
  const snippet = readSourceSnippet(node, projectRoot, maxSourceLines);
  const heading = snippet?.stale ? "### Source [stale]" : "### Source";
  return {
    body: `${heading}\n${snippet ? snippet.text : "source unavailable"}\n`,
    hasLocalExceptions: snippet?.stale ?? false,
  };
}
```

Then update the existing `symbolCard()` function in the same file so its current inline source block at `src/tools/symbol-card.ts:50-61` is replaced by a call to `renderSymbolSourceSection({ name, file, store, projectRoot, maxSourceLines })` and the returned `body` is spliced into the `lines` array at the same position. This preserves the standalone card output shape (so `test/tool-symbol-card-happy.test.ts`, `test/tool-symbol-card-source.test.ts`, etc. stay green) while routing the actual source rendering through the shared helper.

Then in `src/tools/symbol-graph.ts`, append the shared source section after the active base and after any contract section:

```ts
import { renderSymbolCardBody, renderSymbolSourceSection } from "./symbol-card.js";


if ((include ?? []).includes("source")) {
  const rendered = renderSymbolSourceSection({
    name: params.name,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
  });
  body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
  hasLocalExceptions = hasLocalExceptions || rendered.hasLocalExceptions;
}
```

Do not inline source into the default base; it must remain opt-in.
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-source-include.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing (existing `test/tool-symbol-card-source.test.ts` and other standalone card tests still green because the standalone `### Source` / `### Source [stale]` shape is preserved).

### Task 7: Remove standalone symbol_card and symbol_contract registrations [depends: 1, 4, 5, 6]

### Task 7: Remove standalone symbol_card and symbol_contract registrations [depends: 1, 4, 5, 6]

Covers AC 1, AC 19, AC 22.

**Scope note (responds to review):**
The previous version only asserted registration metadata, which did not prove AC 19 ("output contains no deprecation warnings or migration ceremony"). This revision extends the default-card and legacy-neighborhood test files from Tasks 3 and 4 with explicit negative output assertions so AC 19 is covered for both default and include-driven `symbol_graph` usage.
**Files:**
- Modify: `src/index.ts`
- Modify: `test/tool-symbol-card-wiring.test.ts`
- Modify: `test/tool-symbol-contract-wiring.test.ts`
- Modify: `test/extension-tool-descriptions.test.ts`
- Modify: `tests/ptc-metadata.test.ts`
- Modify: `test/token-tracker-wiring-check.test.ts`
- Modify: `test/tool-symbol-graph-default-card.test.ts` (extend for AC 19)
- Modify: `test/tool-symbol-graph-legacy-neighborhood.test.ts` (extend for AC 19)
**Step 1 — Write the failing test**
Replace `test/tool-symbol-card-wiring.test.ts` with:
```ts
import { expect, test } from "bun:test";

test("pi extension no longer registers symbol_card and keeps internal renderers exported", async () => {
  const registeredTools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  const symbolCardMod = await import("../src/tools/symbol-card.js");
  piCodegraph(mockPi as any);
  expect(registeredTools.find((t) => t.name === "symbol_card")).toBeUndefined();
  expect(typeof (symbolCardMod as any).renderSymbolCardBody).toBe("function");
  expect(typeof (symbolCardMod as any).renderSymbolSourceSection).toBe("function");
});
```

Replace `test/tool-symbol-contract-wiring.test.ts` with:

```ts
import { expect, test } from "bun:test";

test("pi extension no longer registers symbol_contract and keeps renderSymbolContractBody exported", async () => {
  const registeredTools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  const symbolContractMod = await import("../src/tools/symbol-contract.js");
  piCodegraph(mockPi as any);
  expect(registeredTools.find((t) => t.name === "symbol_contract")).toBeUndefined();
  expect(typeof (symbolContractMod as any).renderSymbolContractBody).toBe("function");
});
```

Update `test/extension-tool-descriptions.test.ts` so the expected default public tools are exactly:

```ts
const expected = new Map<string, string>([
  ["symbol_graph", "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol."],
  ["resolve_edge", "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs."],
  ["delete_edge", "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete."],
  ["impact", "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code."],
  ["trace", "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs."],
]);
```

Update `tests/ptc-metadata.test.ts` so `READ_ONLY_TOOLS` becomes:

```ts
const READ_ONLY_TOOLS = [
  "symbol_graph",
  "impact",
  "trace",
  "graph_query",
  "graph_overview",
  "dead_code",
];
```

Update `test/token-tracker-wiring-check.test.ts` so `expected` becomes:

```ts
const expected = [
  "symbol_graph",
  "trace",
  "impact",
  "resolve_edge",
  "delete_edge",
];
```

**AC 19 output assertions.** Extend the existing `test/tool-symbol-graph-default-card.test.ts` default-card test (from Task 3) with these negative assertions **inside** the main test block, immediately after the existing `expect(withoutInclude).not.toContain("### Source")` line:

```ts
    expect(withoutInclude.toLowerCase()).not.toContain("deprecated");
    expect(withoutInclude).not.toContain("use symbol_graph instead");
    expect(withoutInclude).not.toContain("symbol_card(");
    expect(withoutInclude).not.toContain("symbol_contract(");
```

And extend `test/tool-symbol-graph-legacy-neighborhood.test.ts` (from Task 4) — inside the `include:['neighborhood']` test, after the `expect(neighborhood).toBe(expected)` line — with:

```ts
    expect(neighborhood.toLowerCase()).not.toContain("deprecated");
    expect(neighborhood).not.toContain("use symbol_graph instead");
    expect(neighborhood).not.toContain("symbol_card(");
    expect(neighborhood).not.toContain("symbol_contract(");
```

This extension is what proves AC 19 for both the default compact card and the legacy neighborhood base.
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-wiring.test.ts test/tool-symbol-contract-wiring.test.ts test/extension-tool-descriptions.test.ts tests/ptc-metadata.test.ts test/token-tracker-wiring-check.test.ts`
Expected: FAIL — the two wiring tests report `expect(received).toBeUndefined()` because `symbol_card` / `symbol_contract` are still registered in `src/index.ts`, and `test/extension-tool-descriptions.test.ts` throws `Error: registered tool list mismatch: ...` because the default public tool list is still 7 tools. `tests/ptc-metadata.test.ts` and `test/token-tracker-wiring-check.test.ts` are expected to stay green at this step because they do not fail on extra registrations.
**Step 3 — Write minimal implementation**
In `src/index.ts`:


1. Remove the `symbolCard` and `symbolContract` imports at the top of the file.
2. Delete the `SymbolCardParams` and `SymbolContractParams` schema blocks.
3. Delete the `registerReadOnlyTool(pi, { name: "symbol_card", ... })` block.
4. Delete the `registerReadOnlyTool(pi, { name: "symbol_contract", ... })` block.
5. Keep `symbol_graph` registered, keep `resolve_edge`, `delete_edge`, `impact`, and `trace` unchanged, and keep the internal renderer exports in `src/tools/symbol-card.ts` / `src/tools/symbol-contract.ts` intact.
Do not add any deprecation warning string to `symbol_graph` output. The AC 19 assertions extended into the Task 3 and Task 4 test files (see Step 1) already lock this invariant.
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-wiring.test.ts test/tool-symbol-contract-wiring.test.ts test/extension-tool-descriptions.test.ts tests/ptc-metadata.test.ts test/token-tracker-wiring-check.test.ts test/tool-symbol-graph-default-card.test.ts test/tool-symbol-graph-legacy-neighborhood.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 8: Record AC 21 downstream audit artifact [no-test] [depends: 5, 7]

### Task 8: Record AC 21 downstream audit artifact [no-test]

Covers AC 21.

**Scope note (responds to review):**
The previous Task 8 bundled documentation edits and an AC 21 audit note. The documentation edits and their drift test are now owned by Task 5 (which has real RED/GREEN tests). What remains for Task 8 is a small, documentation-only AC 21 artifact that records the accepted out-of-scope break for the external downstream repo. This is genuinely test-free (it is an inert markdown record with no runtime behavior), so `[no-test]` is justified, and the file has an explicit path and a verification step.

**Justification for `[no-test]`:** This task only creates a human-readable audit record inside `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/`. It is not loaded by any runtime path. The docs that do affect runtime / tool descriptions are owned and tested by Task 5.
**Files:**
- Create: `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md`
**Step 1 — Make the change**
Create `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md` with exactly this content:
```md
# Downstream audit
## In-repo runtime / public-surface references audited
- `src/index.ts` — standalone `symbol_card` / `symbol_contract` registrations removed in Task 7.
- `test/tool-symbol-card-wiring.test.ts` — updated to assert non-registration.
- `test/tool-symbol-contract-wiring.test.ts` — updated to assert non-registration.
- `test/extension-tool-descriptions.test.ts` — expected default public surface reduced to 5 tools.
- `tests/ptc-metadata.test.ts` — removed from registered read-only tool list.
- `test/token-tracker-wiring-check.test.ts` — removed from expected default registrations.
- `README.md`, `ARCHITECTURE.md`, `docs/tool-descriptions.md` — public docs updated to describe `symbol_graph` as the unified lookup surface.

## Accepted out-of-scope breaks
- External downstream repo `pi-coding-tools` — known `symbol_card` / `symbol_contract` registered-tool references are intentionally not updated in this issue by explicit user direction. This is the accepted out-of-scope break for AC 21.

## Non-runtime historical references intentionally left unchanged
- Historical roadmap / issue / changelog files under `.megapowers/` and `ROADMAP.md` are not active runtime consumers of registered tool names.
```

This satisfies AC 21 (audit of known downstream references with explicit accepted-break disposition) in a way that is machine-locatable at a stable path.
**Step 2 — Verify**
Run:

```sh
test -f .megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md \
  && grep -q 'accepted out-of-scope break' .megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md \
  && bun run check
```

Expected:
- `test -f` exits 0 because the audit file exists at the specified path.
- `grep -q` exits 0 because the required `accepted out-of-scope break` phrase is present.
- `bun run check` (TypeScript + lint) succeeds unchanged; no runtime behavior is modified by this task.
