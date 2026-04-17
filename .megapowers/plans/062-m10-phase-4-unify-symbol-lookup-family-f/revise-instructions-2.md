# Revise Instructions — Iteration 2

> Most of the revised tasks have **silent content loss** — the revise edits dropped several required declarations and/or opening braces, leaving the Step 1 tests and Step 3 implementations non-compilable as written. The design direction from iteration 1 is correct, but the code blocks must be restored to be complete and self-contained.
>
> For each task below, **rewrite the affected sections in full** rather than trying to patch missing lines around each other. When you rewrite a code block, verify by reading the file immediately after editing that every declaration referenced later in the block is actually present.

---

## Task 1: Extract shared compact card renderer — ❌ REVISE

### Problem

Both the Step 1 test and the Step 3 implementation are missing declarations that later code references. As written they will not compile.

**Step 1 test is missing:**

- The `const fileAContent = ...` declaration (referenced by `writeFileSync` and `sha256Hex`).
- The `const store = new SqliteGraphStore();` declaration (referenced by `store.addNode`, `store.addEdge`, `store.close`, and the `renderSymbolCardBody` call).

**Step 3 implementation is missing:**

- The opening `if (nodes.length === 0) {` brace before the `return { body: \`Symbol "${name}" not found\`, ... }` line (the closing `}` is orphaned).
- The `const tests = allNeighbors.filter((nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id);` declaration (referenced by `if (tests.length > 0)`).
- The `const relSections: string[] = [];` declaration (referenced by the `relSections.push(...)` calls).
- The opening `if (relSections.length > 0) {` brace before the three `lines.push(...)` calls (the closing `}` is orphaned).
- The opening `return {` brace before `body: lines.join("\n") + "\n",` (the fields float free).

### Fix

Replace the **entire** Step 1 and Step 3 code blocks with the complete versions below.

**Step 1 — complete test code:**

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

**Step 3 — complete implementation code:**

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

---

## Task 3: Make symbol_graph default to compact card — ❌ REVISE

### Problem

Multiple lines were dropped from Step 1 test and Step 3 implementation, breaking them.

**Step 1 test is missing:**

- The opening `test("symbolGraph defaults to a compact card and include:[] matches omitted include", () => {` wrapper — the test body is floating free after the imports.
- The `const fileAContent = ...` declaration (referenced by writes and hashing).
- The `store.addNode({ id: "src/a.ts::foo:3", ... })` line (the node that the edges reference).
- The `expect(withoutInclude).toBe(withEmptyInclude);` assertion (AC 4).
- The `expect(symbolGraph({ name: "doesNotExist", store, projectRoot })).toContain('Symbol "doesNotExist" not found');` line in the ambiguous/not-found test.

**Step 3 implementation is missing:**

- The `export interface SymbolGraphParams { ... }` opening line (`name: string;` floats free).
- The `const useNeighborhoodBase = (include ?? []).includes("neighborhood");` declaration before the `const base = useNeighborhoodBase ? ...` line.

**Ordering note from iteration 1 still unresolved:** Task 3 tells the implementer to pass `include: ["neighborhood"]` into the registered `symbol_graph` tool from `test/tool-symbol-graph-lsp.test.ts` before Task 4 broadens the schema. If the registered tool runs a TypeBox `Value.Check` on parameters before calling `execute`, the `include` arg will be rejected for the duration of Task 3 and the LSP test updates will themselves be red. **Fix this by moving the schema-broadening edit into Task 3** (keep Task 4 for the dedicated schema-acceptance test and the `include: ["source"]` acceptance only), OR explicitly document that Tasks 3 and 4 must be committed atomically during implement and drop the "each task is a self-contained TDD cycle" expectation for that pair. Pick one and update the plan accordingly.

### Fix

Replace Step 1 and Step 3 with the full versions below. Then resolve the Task 3 / Task 4 ordering issue in the Scope note.

**Step 1 — complete test code:**

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

**Step 3 — complete implementation code:**

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

### Ordering fix

The cleanest option: move the schema broadening from Task 4 Step 3 into Task 3 Step 3, so the `include: ["neighborhood"] as any` cast in migrated tests is accepted by the registered tool immediately. Task 4 then keeps:

- its schema-acceptance test (schema rejects `"signals"` / `"wat"`, accepts `"neighborhood"` / `"contract"` / `"source"`),
- its legacy byte-identity test,
- the `include` execute-path cast at `src/index.ts:212`,
- no schema edit (already done in Task 3).

Update Task 3's Scope note and Task 4's Scope note to describe this split explicitly.

---

## Task 4: Validate include values and preserve legacy neighborhood output — ❌ REVISE

### Problem

Step 1 test is missing structural scaffolding:

- `test("symbol_graph schema accepts only neighborhood, contract, and source includes", () => {` opening wrapper is gone — `const tools: ToolDefinition<any>[] = [];` is at module top level.
- `resetStoreForTesting();` call is gone.
- `const tool = tools.find((candidate) => candidate.name === "symbol_graph");` is gone.
- `const schema = tool.parameters as any;` is gone (the `Value.Check(schema, ...)` calls reference undefined `schema`).
- `const store = new SqliteGraphStore();` is gone from the second test.
- `store.addNode({ id: "src/a.ts::foo:3", ... })` (the `foo` node) is gone — the `calls` edge references it.
- `expect(neighborhood).toBe(expected);` line is gone — this is the **core AC 10 byte-identity assertion**, losing it defeats the test's purpose.

### Fix

Replace Step 1 test code in full with:

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

### Step 2 expected-failure update

If you move the schema broadening to Task 3 (see Task 3 ordering fix), Task 4 Step 2's expected failure shifts to the byte-identity assertion (`expect(neighborhood).toBe(expected)`) instead. Rewrite Step 2 so the expected failure matches whichever ordering you pick.

---

## Task 6: Append source sections from the shared source renderer — ❌ REVISE

### Problem

**Step 1 test is missing:**

- `const store = new SqliteGraphStore();` inside `setupSourceFixture()` — `store.addNode` and the returned `store` handle have no object.
- `expect(withSource.startsWith(base)).toBe(true);` (AC 14 — proves append, not replace).
- `expect(withSource.startsWith(neighborhoodBody)).toBe(true);` (AC 11/14 for neighborhood+source).
- `expect(contractIdx).toBeGreaterThan(-1);` (proves contract section is present at all before asserting ordering).

**Step 3 implementation is missing:**

- The `if ((include ?? []).includes("source")) {` opening brace in `src/tools/symbol-graph.ts` — the `const rendered = renderSymbolSourceSection(...)` call and subsequent `body = ...` / `hasLocalExceptions = ...` lines float free after the closing `}` of the contract block.

### Fix

Replace Step 1 `setupSourceFixture` and the first three tests with:

```ts
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
```

Replace the `symbol-graph.ts` Step 3 append block with:

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

---

## Task 7: Remove standalone symbol_card and symbol_contract registrations — ❌ REVISE

### Problem

Step 3's numbered list starts at `2.` — the first item (`Remove the symbolCard and symbolContract imports.`) was dropped. Without it, the implementer may leave dead imports behind and TS will warn/error on unused imports.

### Fix

Replace the Step 3 body in Task 7 with:

```text
In `src/index.ts`:

1. Remove the `symbolCard` and `symbolContract` imports at the top of the file.
2. Delete the `SymbolCardParams` and `SymbolContractParams` schema blocks.
3. Delete the `registerReadOnlyTool(pi, { name: "symbol_card", ... })` block.
4. Delete the `registerReadOnlyTool(pi, { name: "symbol_contract", ... })` block.
5. Keep `symbol_graph` registered, keep `resolve_edge`, `delete_edge`, `impact`, and `trace` unchanged, and keep the internal renderer exports in `src/tools/symbol-card.ts` / `src/tools/symbol-contract.ts` intact.

Do not add any deprecation warning string to `symbol_graph` output. The AC 19 assertions extended into the Task 3 and Task 4 test files (see Step 1) already lock this invariant.
```

---

## plan.md top-level formatting — ❌ REVISE

### Problem

The `## Task list` section is missing the leading `1.`, `3.`, `4.` bullets with their bold task titles — only the indented `Detailed task` lines remain. This breaks the task-list rendering.

### Fix

Rewrite the `## Task list` block so every task has its numbered bold-title line:

```md
## Task list

1. **Extract shared compact card renderer**
   Detailed task: `tasks/task-001.md`
   Covers AC 2, AC 5, AC 6, AC 7, AC 22.

2. **Extract shared legacy neighborhood renderer**
   Detailed task: `tasks/task-002.md`
   Covers AC 2, AC 10, AC 22.

3. **Make `symbol_graph` default to compact card**
   Detailed task: `tasks/task-003.md`
   Covers AC 3, AC 4, AC 5, AC 6, AC 7, AC 17, AC 18, AC 22.

4. **Validate `include` values and preserve legacy neighborhood output**
   Detailed task: `tasks/task-004.md`
   Covers AC 8, AC 9, AC 10, AC 11, AC 22.

5. **Add automated docs drift test and update public docs for unified `symbol_graph`**
   Detailed task: `tasks/task-005.md`
   Covers AC 20, AC 22.

6. **Append source sections from the shared source renderer**
   Detailed task: `tasks/task-006.md`
   Covers AC 2, AC 14, AC 15, AC 16, AC 17, AC 18, AC 22.

7. **Remove standalone `symbol_card` and `symbol_contract` registrations**
   Detailed task: `tasks/task-007.md`
   Covers AC 1, AC 19, AC 22.

8. **Record AC 21 downstream audit artifact**
   Detailed task: `tasks/task-008.md`
   Covers AC 21, AC 23.
```

---

## Post-fix verification checklist

After re-editing each task file, **read it back in full** and confirm:

- [ ] Every variable referenced inside a test body has a matching `const/let` declaration earlier in that body.
- [ ] Every opening `{` has a matching close, every `function foo(…) {` has a body before its `}`.
- [ ] Every `test(...)` / `describe(...)` wrapper has both the opening `() => {` arrow and the closing `});`.
- [ ] Every `if (...) {` that visually contains indented code actually has the opening brace in the saved file.
- [ ] Numbered lists in Step 3 (Task 7) start at `1.`, not `2.`.
- [ ] `plan.md` task list renders with `1.`, `2.`, `3.`, … bullets — no orphan `Detailed task` lines.

When the plan comes back, a reviewer will mechanically check these before anything else.
