# Plan

### Task 1: symbolCard returns not-found with trust header

**Files:**
- Create: `src/tools/symbol-card.ts`
- Test: `test/tool-symbol-card-not-found.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-not-found.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";

test("symbolCard returns not-found message with trust header for unknown symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nf-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function foo() {}\n");

  try {
    const store = new SqliteGraphStore();
    const output = symbolCard({ name: "doesNotExist", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("not found");
    expect(output).toContain("doesNotExist");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-not-found.test.ts`
Expected: FAIL — Cannot find module "../src/tools/symbol-card.js"

**Step 3 — Write minimal implementation**

```ts
// src/tools/symbol-card.ts
import type { GraphStore } from "../graph/store.js";
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

  // Disambiguation and card rendering added in subsequent tasks
  return prependTrustHeader(`Symbol "${name}" not found`, { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-not-found.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: symbolCard returns disambiguation list for multiple matches [depends: 1]

**Files:**
- Modify: `src/tools/symbol-card.ts`
- Test: `test/tool-symbol-card-ambiguous.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-ambiguous.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard returns disambiguation list when multiple nodes match", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() {}\n";
  const fileBContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);

  try {
    const store = new SqliteGraphStore();
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
    expect(output).toContain("function");
    expect(output).toContain("class");
    // Should NOT contain card sections
    expect(output).not.toContain("### Signature");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-ambiguous.test.ts`
Expected: FAIL — expect(received).toContain(expected) — Expected string to contain "Multiple matches"

**Step 3 — Write minimal implementation**

In `src/tools/symbol-card.ts`, replace the stub after the `nodes.length === 0` check:

```ts
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

  // Single-match card rendering — next task
  return prependTrustHeader(`Symbol "${name}"`, { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-ambiguous.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: symbolCard renders full card for single match with signature and relationships [depends: 2]

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

### Task 4: symbolCard shows "not available" when signature is null [depends: 3]

**Files:**
- Test: `test/tool-symbol-card-no-signature.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-no-signature.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard shows 'not available' when node has no signature", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nosig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(fileContent);

    // Node WITHOUT signature field
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hash });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Signature");
    expect(output).toContain("not available");
    // Should NOT contain "undefined" or "null" as strings
    expect(output).not.toContain("undefined");
    expect(output).not.toContain("null");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-no-signature.test.ts`
Expected: PASS (already handled in Task 3 via `node.signature ?? "not available"`)

Note: This test validates the fallback behavior is correct. It should pass immediately given the Task 3 implementation. If it does pass, that's fine — this is a verification test for AC 7.

**Step 3 — No additional implementation needed**

The `node.signature ?? "not available"` from Task 3 handles this case.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-no-signature.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: symbolCard omits Covering Tests section when no tested_by edges exist [depends: 3]

**Files:**
- Test: `test/tool-symbol-card-no-tests.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-no-tests.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard omits Covering Tests section when symbol has no tested_by edges", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-notests-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(fileContent);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hash });

    const output = symbolCard({ name: "foo", store, projectRoot });

    // Card renders but no Covering Tests section
    expect(output).toContain("## foo (function)");
    expect(output).not.toContain("Covering Tests");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-no-tests.test.ts`
Expected: PASS (Task 3 implementation only adds Covering Tests when `tests.length > 0`)

Note: This is a verification test for AC 8's edge case. Should pass immediately.

**Step 3 — No additional implementation needed**

Already handled in Task 3 via the `if (tests.length > 0)` guard.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-no-tests.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: symbolCard includes extends and implements in Key Relationships [depends: 3]

**Files:**
- Test: `test/tool-symbol-card-extends-implements.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-extends-implements.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard shows extends and implements in Key Relationships", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-ext-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export class Dog extends Animal implements Pet {}\n";
  const baseContent = "export class Animal {}\n";
  const ifaceContent = "export interface Pet {}\n";
  writeFileSync(join(projectRoot, "src/dog.ts"), fileContent);
  writeFileSync(join(projectRoot, "src/animal.ts"), baseContent);
  writeFileSync(join(projectRoot, "src/pet.ts"), ifaceContent);

  try {
    const store = new SqliteGraphStore();
    const hashDog = sha256Hex(fileContent);
    const hashAnimal = sha256Hex(baseContent);
    const hashPet = sha256Hex(ifaceContent);

    store.addNode({ id: "src/dog.ts::Dog:1", kind: "class", name: "Dog", file: "src/dog.ts", start_line: 1, end_line: 1, content_hash: hashDog, is_exported: true });
    store.addNode({ id: "src/animal.ts::Animal:1", kind: "class", name: "Animal", file: "src/animal.ts", start_line: 1, end_line: 1, content_hash: hashAnimal });
    store.addNode({ id: "src/pet.ts::Pet:1", kind: "interface", name: "Pet", file: "src/pet.ts", start_line: 1, end_line: 1, content_hash: hashPet });

    store.addEdge({
      source: "src/dog.ts::Dog:1", target: "src/animal.ts::Animal:1", kind: "extends",
      provenance: { source: "tree-sitter", confidence: 1.0, evidence: "extends clause", content_hash: hashDog },
      created_at: Date.now(),
    });
    store.addEdge({
      source: "src/dog.ts::Dog:1", target: "src/pet.ts::Pet:1", kind: "implements",
      provenance: { source: "tree-sitter", confidence: 1.0, evidence: "implements clause", content_hash: hashDog },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "Dog", store, projectRoot });

    expect(output).toContain("### Key Relationships");
    expect(output).toContain("Extends");
    expect(output).toContain("Animal");
    expect(output).toContain("Implements");
    expect(output).toContain("Pet");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-extends-implements.test.ts`
Expected: PASS (Task 3 implementation already includes extends/implements in relationships)

Note: This is a verification test for AC 12. Should pass with Task 3's implementation.

**Step 3 — No additional implementation needed**

Already handled in Task 3 via `extendsOut` and `implementsOut` filters.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-extends-implements.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: Register symbol_card tool in pi extension entry [depends: 3]

**Files:**
- Modify: `src/index.ts`
- Test: `test/tool-symbol-card-wiring.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers symbol_card tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const scTool = registeredTools.find((t) => t.name === "symbol_card");
  expect(scTool).toBeDefined();

  const schema = scTool!.parameters as any;
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("name");
  expect(schema.required).not.toContain("file");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-wiring.test.ts`
Expected: FAIL — expect(received).toBeDefined() — scTool is undefined

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at top:
```ts
import { symbolCard } from "./tools/symbol-card.js";
```

2. Add TypeBox params after `DeleteEdgeParams`:
```ts
const SymbolCardParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});
```

3. Add tool registration inside `piCodegraph` function, after the `graph_query` registration:
```ts
  pi.registerTool({
    name: "symbol_card",
    label: "Symbol Card",
    description: "Return a compact symbol summary: definition, signature, tests, relationships, and signals",
    parameters: SymbolCardParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = symbolCard({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
