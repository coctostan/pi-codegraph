# Plan

### Task 1: Aliased imports resolve to original exported name

**AC:** 9 (aliased imports), 19 (regression safety)

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `test/indexer-extract-file.test.ts`

**Step 1 — Write the failing test**

In `test/indexer-extract-file.test.ts`, update the existing aliased import test and add a new test for alias-to-call resolution:

```ts
// Replace the existing test at line ~125 with this updated version:
test("extractFile extracts import edges for named, aliased, and default imports", () => {
  const file = "src/imports.ts";
  const content = [
    "import { foo } from './bar';",
    'import { foo as baz } from "./bar";',
    'import Foo from "./bar";',
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const imports = result.edges.filter((e) => e.kind === "imports");

  const fooEdge = imports.find((e) => e.target.includes("::foo:"));
  expect(fooEdge).toBeDefined();
  expect(fooEdge).toMatchObject({
    source: nodeId(file, file, 1),
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: expect.stringContaining("./bar"),
      content_hash: expectedHash,
    },
  });

  // Aliased import: `import { foo as baz }` should create edge targeting original name `foo`, not `baz`
  const bazEdge = imports.find((e) => e.target.includes("::baz:"));
  expect(bazEdge).toBeUndefined(); // no edge to "baz"

  // There should be TWO edges to "foo" (one from named, one from alias)
  const fooEdges = imports.filter((e) => e.target.includes("::foo:"));
  expect(fooEdges.length).toBe(2);

  const defaultEdge = imports.find((e) => e.target.includes("::default:"));
  expect(defaultEdge).toBeDefined();
});

// Add new test for alias call resolution:
test("extractFile resolves aliased import calls to the original exported name", () => {
  const file = "src/alias-call.ts";
  const content = [
    'import { helper as h } from "./utils";',
    "function main() {",
    "  h();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);

  const callEdges = result.edges.filter((e) => e.kind === "calls");
  // h() should resolve to "helper", not "h"
  const helperCall = callEdges.find((e) => e.target.includes("::helper:"));
  expect(helperCall).toBeDefined();

  const hCall = callEdges.find((e) => e.target.includes("::h:"));
  expect(hCall).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // Expected: 2, Received: 1` (aliased import currently creates edge to "baz" not "foo", and there's only 1 foo edge) and the alias-call test fails because `h()` creates an edge to `__unresolved__::h:0` not `__unresolved__::helper:0`.

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, modify the `extractFile` function's import extraction and call extraction:

1. In the import_statement handler (around line 170), when iterating `namedImports`, check for an `alias` field on the import_specifier. If present, use the `name` field (original) for the edge target, and build a local alias map.
2. In the call visitor, look up bare identifiers in the alias map before creating the edge.

```ts
// Inside extractFile, before the walk() call, add:
const aliasToOriginal = new Map<string, string>();

// Inside the namedImports loop (around line 172), replace the current block with:
for (const spec of namedImports.namedChildren) {
  if (spec.type !== "import_specifier") continue;
  const nameNode = spec.childForFieldName("name");
  if (!nameNode) continue;
  const originalName = nameNode.text;

  const aliasNode = spec.childForFieldName("alias");
  if (aliasNode) {
    aliasToOriginal.set(aliasNode.text, originalName);
  }

  pushEdge({
    source: moduleNode.id,
    target: unresolvedId(originalName),
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence,
      content_hash: contentHash,
    },
    created_at: Date.now(),
  });
}

// In the call visitor, where callee?.type === "identifier" (around line 238), replace:
//   target: unresolvedId(callee.text),
// with:
  target: unresolvedId(aliasToOriginal.get(callee.text) ?? callee.text),
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 168 tests passing

### Task 2: Namespace imports with qualified call resolution [depends: 1]

**AC:** 10 (namespace imports)

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/indexer-namespace-imports.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-namespace-imports.test.ts`:

```ts
import { expect, test } from "bun:test";
import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile extracts namespace import and resolves qualified calls", () => {
  const file = "src/app.ts";
  const content = [
    'import * as utils from "./utils";',
    "function main() {",
    "  utils.helper();",
    "  utils.format();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);

  // Should have an import edge for the namespace
  const importEdges = result.edges.filter((e) => e.kind === "imports");
  const nsImport = importEdges.find((e) => e.target.includes("::*:"));
  expect(nsImport).toBeDefined();
  expect(nsImport!.provenance.evidence).toContain("./utils");

  // utils.helper() should create a calls edge to __unresolved__::helper:0
  const callEdges = result.edges.filter((e) => e.kind === "calls");
  const helperCall = callEdges.find((e) => e.target.includes("::helper:"));
  expect(helperCall).toBeDefined();
  expect(helperCall!.source).toBe(nodeId(file, "main", 2));

  // utils.format() should create a calls edge to __unresolved__::format:0
  const formatCall = callEdges.find((e) => e.target.includes("::format:"));
  expect(formatCall).toBeDefined();
});

test("extractFile does not treat non-namespace member calls as qualified calls", () => {
  const file = "src/plain.ts";
  const content = [
    "function run() {",
    "  obj.method();",
    "  this.foo();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);

  const callEdges = result.edges.filter((e) => e.kind === "calls");
  // obj and this are not namespace imports, so no calls edges
  expect(callEdges.find((e) => e.target.includes("::method:"))).toBeUndefined();
  expect(callEdges.find((e) => e.target.includes("::foo:"))).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-namespace-imports.test.ts`
Expected: FAIL — `expect(received).toBeDefined() // Received: undefined` for the namespace import edge and the qualified call edges, since neither namespace imports nor member-access calls are currently extracted.

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, inside `extractFile`:

1. Add a `namespaceImports` set alongside the existing `aliasToOriginal` map.
2. In the `import_statement` handler, detect `namespace_import` nodes (`import * as ns`), create an import edge, and record `ns` in the set.
3. In the call visitor, detect `member_expression` callees where the object is a known namespace identifier.

```ts
// After aliasToOriginal declaration, add:
const namespaceImports = new Set<string>();

// In the import_statement handler, after the hasDefault block and before the namedImports block, add:
const nsImport = importClause.namedChildren.find((c) => c.type === "namespace_import");
if (nsImport) {
  const nsNameNode = nsImport.namedChildren.find((c) => c.type === "identifier");
  if (nsNameNode) {
    namespaceImports.add(nsNameNode.text);
    pushEdge({
      source: moduleNode.id,
      target: unresolvedId("*"),
      kind: "imports",
      provenance: {
        source: "tree-sitter",
        confidence: 0.5,
        evidence,
        content_hash: contentHash,
      },
      created_at: Date.now(),
    });
  }
}

// In the call visitor, after the existing `callee?.type === "identifier"` block (around line 251), add:
if (callee?.type === "member_expression") {
  const obj = callee.childForFieldName("object");
  const prop = callee.childForFieldName("property");
  if (obj?.type === "identifier" && prop?.type === "property_identifier" && namespaceImports.has(obj.text)) {
    pushEdge({
      source: nextFunctionId,
      target: unresolvedId(prop.text),
      kind: "calls",
      provenance: {
        source: "tree-sitter",
        confidence: 0.5,
        evidence: callEvidence(prop),
        content_hash: contentHash,
      },
      created_at: Date.now(),
    });
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-namespace-imports.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing (168 existing + 2 new)

### Task 3: Re-export extraction from source modules [depends: 1]

**AC:** 11 (re-exports), 12 (barrel file awareness)

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/indexer-reexports.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-reexports.test.ts`:

```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile extracts re-export with original name", () => {
  const file = "src/index.ts";
  const content = 'export { foo } from "./bar";';
  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const importEdges = result.edges.filter((e) => e.kind === "imports");
  const fooEdge = importEdges.find((e) => e.target.includes("::foo:"));
  expect(fooEdge).toBeDefined();
  expect(fooEdge).toMatchObject({
    source: nodeId(file, file, 1),
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: expect.stringContaining("./bar"),
      content_hash: expectedHash,
    },
  });
});

test("extractFile extracts re-export with alias using original name", () => {
  const file = "src/index.ts";
  const content = 'export { foo as baz } from "./bar";';
  const result = extractFile(file, content);

  const importEdges = result.edges.filter((e) => e.kind === "imports");

  // Edge should target original name "foo", not alias "baz"
  const fooEdge = importEdges.find((e) => e.target.includes("::foo:"));
  expect(fooEdge).toBeDefined();

  const bazEdge = importEdges.find((e) => e.target.includes("::baz:"));
  expect(bazEdge).toBeUndefined();
});

test("extractFile extracts multiple re-exports from barrel file", () => {
  const file = "src/index.ts";
  const content = [
    'export { alpha, beta } from "./math";',
    'export { gamma } from "./science";',
  ].join("\n");
  const result = extractFile(file, content);

  const importEdges = result.edges.filter((e) => e.kind === "imports");
  expect(importEdges.find((e) => e.target.includes("::alpha:"))).toBeDefined();
  expect(importEdges.find((e) => e.target.includes("::beta:"))).toBeDefined();
  expect(importEdges.find((e) => e.target.includes("::gamma:"))).toBeDefined();
  expect(importEdges).toHaveLength(3);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-reexports.test.ts`
Expected: FAIL — `expect(received).toBeDefined() // Received: undefined` for the re-export import edges, since `export { ... } from "..."` is not currently handled.

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, inside the `walk` callback in `extractFile`, add a handler for `export_statement` nodes that have a `source` field (re-exports):

```ts
// After the import_statement handler (after line 194), add:
if (n.type === "export_statement") {
  const sourceNode = n.childForFieldName("source");
  if (!sourceNode) return; // Not a re-export (e.g., `export { foo }` without `from`)

  const evidence = sourceNode.text;

  // Handle `export { name1, name2 as alias } from "./source"`
  for (const child of n.namedChildren) {
    if (child.type === "export_clause") {
      for (const spec of child.namedChildren) {
        if (spec.type !== "export_specifier") continue;
        const nameNode = spec.childForFieldName("name");
        if (!nameNode) continue;
        const originalName = nameNode.text;

        pushEdge({
          source: moduleNode.id,
          target: unresolvedId(originalName),
          kind: "imports",
          provenance: {
            source: "tree-sitter",
            confidence: 0.5,
            evidence,
            content_hash: contentHash,
          },
          created_at: Date.now(),
        });
      }
    }
  }
  return;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-reexports.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 4: Dynamic import extraction with low confidence

**AC:** 13 (dynamic imports)

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/indexer-dynamic-imports.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-dynamic-imports.test.ts`:

```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile extracts dynamic import as low-confidence import edge", () => {
  const file = "src/lazy.ts";
  const content = [
    "async function loadModule() {",
    '  const mod = await import("./heavy");',
    "}",
  ].join("\n");
  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const importEdges = result.edges.filter((e) => e.kind === "imports");
  // Dynamic import creates a module-level import edge
  const dynamicEdge = importEdges.find((e) => e.provenance.confidence === 0.3);
  expect(dynamicEdge).toBeDefined();
  expect(dynamicEdge).toMatchObject({
    source: nodeId(file, file, 1),
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.3,
      evidence: expect.stringContaining("./heavy"),
      content_hash: expectedHash,
    },
  });
});

test("extractFile ignores dynamic import with non-string-literal argument", () => {
  const file = "src/computed.ts";
  const content = [
    "async function loadDynamic(name: string) {",
    "  const mod = await import(name);",
    "}",
  ].join("\n");
  const result = extractFile(file, content);

  const importEdges = result.edges.filter((e) => e.kind === "imports" && e.provenance.confidence === 0.3);
  expect(importEdges).toHaveLength(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-dynamic-imports.test.ts`
Expected: FAIL — `expect(received).toBeDefined() // Received: undefined` for the dynamic import edge, since `import("./heavy")` expressions are not currently extracted.

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, inside the `walk` callback in `extractFile`, add a handler for `call_expression` nodes where the function is `import` (dynamic imports). This should go in the main `walk` visitor (not the `visitCalls`), since dynamic imports are module-level edges:

```ts
// In the walk callback, add before the import_statement handler or after the variable_declarator handler:
if (n.type === "call_expression") {
  const fn = n.childForFieldName("function");
  if (fn?.type === "import") {
    const args = n.childForFieldName("arguments");
    if (args && args.namedChildren.length > 0) {
      const firstArg = args.namedChildren[0];
      if (firstArg?.type === "string" || firstArg?.type === "template_string") {
        const specifier = firstArg.text.replace(/^['"`]|['"`]$/g, "");
        pushEdge({
          source: moduleNode.id,
          target: unresolvedId(specifier),
          kind: "imports",
          provenance: {
            source: "tree-sitter",
            confidence: 0.3,
            evidence: specifier,
            content_hash: contentHash,
          },
          created_at: Date.now(),
        });
      }
    }
  }
}
```

Note: The tree-sitter TypeScript grammar represents `import("./mod")` as a `call_expression` with `function` of type `import`. The arguments are in an `arguments` node. We only extract when the first argument is a string literal.

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-dynamic-imports.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 5: SQLite indexes for tool query patterns

**AC:** 16 (SQLite indexes)

**Files:**
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-indexes.test.ts`

**Step 1 — Write the failing test**

Create `test/graph-store-indexes.test.ts`:

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SQLite store has index on nodes(name) for findNodes/symbol_graph queries", () => {
  const store = new SqliteGraphStore();
  try {
    const rows = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('nodes') WHERE name = 'idx_nodes_name'"
    );
    expect(rows).toHaveLength(1);
  } finally {
    store.close();
  }
});

test("SQLite store has index on edges(kind) for graph_query kind filters", () => {
  const store = new SqliteGraphStore();
  try {
    const rows = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('edges') WHERE name = 'idx_edges_kind'"
    );
    expect(rows).toHaveLength(1);
  } finally {
    store.close();
  }
});

test("SQLite store preserves existing indexes on nodes(file), edges(source), edges(target)", () => {
  const store = new SqliteGraphStore();
  try {
    const nodeFile = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('nodes') WHERE name = 'idx_nodes_file'"
    );
    expect(nodeFile).toHaveLength(1);

    const edgeSource = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('edges') WHERE name = 'idx_edges_source'"
    );
    expect(edgeSource).toHaveLength(1);

    const edgeTarget = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('edges') WHERE name = 'idx_edges_target'"
    );
    expect(edgeTarget).toHaveLength(1);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-indexes.test.ts`
Expected: FAIL — `expect(received).toHaveLength(expected) // Expected length: 1, Received length: 0` for the `idx_nodes_name` and `idx_edges_kind` queries, since those indexes don't exist yet.

**Step 3 — Write minimal implementation**

In `src/graph/sqlite.ts`, in the `initSchema()` method, add the new CREATE INDEX statements after the existing ones (around line 84):

```ts
// After line 84 (`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);`), add:
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-indexes.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 6: getStatistics method on GraphStore interface and SQLite implementation [depends: 5]

**AC:** 17 (index statistics)

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-statistics.test.ts`

**Step 1 — Write the failing test**

Create `test/graph-store-statistics.test.ts`:

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";
import type { GraphNode, GraphEdge } from "../src/graph/types.js";

function makeNode(file: string, name: string, kind: GraphNode["kind"], line: number): GraphNode {
  return { id: nodeId(file, name, line), kind, name, file, start_line: line, end_line: line, content_hash: "abc123" };
}

function makeEdge(source: string, target: string, kind: GraphEdge["kind"], provSource: GraphEdge["provenance"]["source"]): GraphEdge {
  return {
    source,
    target,
    kind,
    provenance: { source: provSource, confidence: 0.5, evidence: "test", content_hash: "abc123" },
    created_at: Date.now(),
  };
}

test("getStatistics returns node counts grouped by kind", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode(makeNode("a.ts", "a.ts", "module", 1));
    store.addNode(makeNode("a.ts", "foo", "function", 2));
    store.addNode(makeNode("a.ts", "Bar", "class", 5));
    store.addNode(makeNode("b.ts", "b.ts", "module", 1));

    const stats = store.getStatistics();

    expect(stats.nodes.module).toBe(2);
    expect(stats.nodes.function).toBe(1);
    expect(stats.nodes.class).toBe(1);
  } finally {
    store.close();
  }
});

test("getStatistics returns edge counts grouped by kind and provenance source", () => {
  const store = new SqliteGraphStore();
  try {
    const modA = makeNode("a.ts", "a.ts", "module", 1);
    const modB = makeNode("b.ts", "b.ts", "module", 1);
    const fn = makeNode("a.ts", "foo", "function", 2);
    store.addNode(modA);
    store.addNode(modB);
    store.addNode(fn);

    store.addEdge(makeEdge(modA.id, "__unresolved__::x:0", "imports", "tree-sitter"));
    store.addEdge(makeEdge(fn.id, "__unresolved__::bar:0", "calls", "tree-sitter"));
    store.addEdge(makeEdge(fn.id, modB.id, "calls", "lsp"));

    const stats = store.getStatistics();

    expect(stats.edges["imports"]["tree-sitter"]).toBe(1);
    expect(stats.edges["calls"]["tree-sitter"]).toBe(1);
    expect(stats.edges["calls"]["lsp"]).toBe(1);
  } finally {
    store.close();
  }
});

test("getStatistics returns file counts (total tracked)", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode(makeNode("a.ts", "a.ts", "module", 1));
    store.addNode(makeNode("b.ts", "b.ts", "module", 1));
    store.setFileHash("a.ts", "hash1");
    store.setFileHash("b.ts", "hash2");

    const stats = store.getStatistics();

    expect(stats.files.total).toBe(2);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-statistics.test.ts`
Expected: FAIL — `TypeError: store.getStatistics is not a function`

**Step 3 — Write minimal implementation**

First, add the interface to `src/graph/store.ts`:

```ts
// Add before the GraphStore interface closing brace (before line 42):
export interface GraphStatistics {
  nodes: Record<string, number>;
  edges: Record<string, Record<string, number>>;
  files: { total: number; stale: number };
}
```

Add `getStatistics` to the `GraphStore` interface:

```ts
  getStatistics(projectRoot?: string): GraphStatistics;
```

Then implement in `src/graph/sqlite.ts`:

```ts
// Import GraphStatistics:
import type { GraphStore, GraphStatistics, NeighborOptions, NeighborResult, TestTraceRecord, TestTraceStep } from "./store.js";

// Add method to SqliteGraphStore class:
  getStatistics(_projectRoot?: string): GraphStatistics {
    const nodeRows = this.db.prepare("SELECT kind, COUNT(*) as cnt FROM nodes GROUP BY kind").all() as Array<{ kind: string; cnt: number }>;
    const nodes: Record<string, number> = {};
    for (const row of nodeRows) nodes[row.kind] = row.cnt;

    const edgeRows = this.db.prepare("SELECT kind, provenance_source, COUNT(*) as cnt FROM edges GROUP BY kind, provenance_source").all() as Array<{ kind: string; provenance_source: string; cnt: number }>;
    const edges: Record<string, Record<string, number>> = {};
    for (const row of edgeRows) {
      if (!edges[row.kind]) edges[row.kind] = {};
      edges[row.kind][row.provenance_source] = row.cnt;
    }

    const fileCountRow = this.db.prepare("SELECT COUNT(*) as cnt FROM file_hashes").get() as { cnt: number };

    return {
      nodes,
      edges,
      files: { total: fileCountRow.cnt, stale: 0 },
    };
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-statistics.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 7: Staleness detection in getStatistics [depends: 6]

**AC:** 18 (staleness detection)

**Files:**
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-staleness.test.ts`

**Step 1 — Write the failing test**

Create `test/graph-store-staleness.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { nodeId } from "../src/graph/types.js";

test("getStatistics reports stale files when content hash no longer matches disk", () => {
  const root = join(tmpdir(), `pi-codegraph-stale-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });

  const originalContent = "export function foo() {}";
  writeFileSync(join(root, "src", "a.ts"), originalContent);
  writeFileSync(join(root, "src", "b.ts"), "export function bar() {}");

  const store = new SqliteGraphStore();
  try {
    // Simulate indexing: set file hashes to match current content
    store.setFileHash("src/a.ts", sha256Hex(originalContent));
    store.setFileHash("src/b.ts", sha256Hex("export function bar() {}"));
    store.addNode({
      id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts",
      file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(originalContent),
    });
    store.addNode({
      id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts",
      file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex("export function bar() {}"),
    });

    // Before modification: no stale files
    const statsBefore = store.getStatistics(root);
    expect(statsBefore.files.stale).toBe(0);
    expect(statsBefore.files.total).toBe(2);

    // Modify a.ts on disk
    writeFileSync(join(root, "src", "a.ts"), "export function foo() { return 42; }");

    // After modification: 1 stale file
    const statsAfter = store.getStatistics(root);
    expect(statsAfter.files.stale).toBe(1);
    expect(statsAfter.files.total).toBe(2);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("getStatistics reports 0 stale when no projectRoot provided", () => {
  const store = new SqliteGraphStore();
  try {
    store.setFileHash("src/a.ts", "somehash");
    const stats = store.getStatistics();
    expect(stats.files.stale).toBe(0);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-staleness.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // Expected: 1, Received: 0` because the current `getStatistics` always returns `stale: 0`.

**Step 3 — Write minimal implementation**

In `src/graph/sqlite.ts`, update the `getStatistics` method to compute staleness when `projectRoot` is provided:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
// (add to existing imports from node:module)

// Update getStatistics:
  getStatistics(projectRoot?: string): GraphStatistics {
    const nodeRows = this.db.prepare("SELECT kind, COUNT(*) as cnt FROM nodes GROUP BY kind").all() as Array<{ kind: string; cnt: number }>;
    const nodes: Record<string, number> = {};
    for (const row of nodeRows) nodes[row.kind] = row.cnt;

    const edgeRows = this.db.prepare("SELECT kind, provenance_source, COUNT(*) as cnt FROM edges GROUP BY kind, provenance_source").all() as Array<{ kind: string; provenance_source: string; cnt: number }>;
    const edges: Record<string, Record<string, number>> = {};
    for (const row of edgeRows) {
      if (!edges[row.kind]) edges[row.kind] = {};
      edges[row.kind][row.provenance_source] = row.cnt;
    }

    const fileRows = this.db.prepare("SELECT file, hash FROM file_hashes").all() as Array<{ file: string; hash: string }>;
    const total = fileRows.length;

    let stale = 0;
    if (projectRoot) {
      for (const row of fileRows) {
        try {
          const content = readFileSync(join(projectRoot, row.file), "utf8");
          const currentHash = createHash("sha256").update(content).digest("hex");
          if (currentHash !== row.hash) stale++;
        } catch {
          stale++; // File missing or unreadable = stale
        }
      }
    }

    return { nodes, edges, files: { total, stale } };
  }
```

Also add the `createHash` import at the top of `sqlite.ts`:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-staleness.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 8: Git co-change log parsing and co-occurrence matrix

**AC:** 1 (git log parsing), 3 (commit age weighting), 4 (evidence format), 5 (minimum threshold)

**Files:**
- Create: `src/indexer/git.ts`
- Test: `test/indexer-git-cochange.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-git-cochange.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";

function createTestRepo(): string {
  const root = join(tmpdir(), `pi-codegraph-git-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });

  execSync("git init", { cwd: root, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: root, stdio: "ignore" });

  // Commit 1: a.ts + b.ts change together
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 1;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "commit1"', { cwd: root, stdio: "ignore" });

  // Commit 2: a.ts + b.ts change together again
  writeFileSync(join(root, "src", "a.ts"), "export const a = 2;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 2;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "commit2"', { cwd: root, stdio: "ignore" });

  // Commit 3: a.ts + c.ts (only once together — below threshold)
  writeFileSync(join(root, "src", "a.ts"), "export const a = 3;");
  writeFileSync(join(root, "src", "c.ts"), "export const c = 1;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "commit3"', { cwd: root, stdio: "ignore" });

  return root;
}

test("runGitCoChangeStage creates co_changes_with edges for file pairs exceeding threshold", async () => {
  const root = createTestRepo();
  const store = new SqliteGraphStore();
  try {
    // Add module nodes so edges have valid targets
    store.addNode({ id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1" });
    store.addNode({ id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2" });
    store.addNode({ id: nodeId("src/c.ts", "src/c.ts", 1), kind: "module", name: "src/c.ts", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: "h3" });
    store.setFileHash("src/a.ts", "h1");
    store.setFileHash("src/b.ts", "h2");
    store.setFileHash("src/c.ts", "h3");

    const { runGitCoChangeStage } = await import("../src/indexer/git.js");
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });

    // a.ts <-> b.ts co-changed 2 times (>= threshold) — should have edges
    const aId = nodeId("src/a.ts", "src/a.ts", 1);
    const bId = nodeId("src/b.ts", "src/b.ts", 1);

    const edges = store.queryRows<{ source: string; target: string; kind: string; provenance_source: string; evidence: string }>(
      "SELECT source, target, kind, provenance_source, evidence FROM edges WHERE kind = 'co_changes_with'"
    );

    // Should have edge between a and b (one direction or both)
    const abEdge = edges.find((e) => (e.source === aId && e.target === bId) || (e.source === bId && e.target === aId));
    expect(abEdge).toBeDefined();
    expect(abEdge!.provenance_source).toBe("git");

    // Evidence should contain co_changes count, recency_score, and window
    expect(abEdge!.evidence).toContain("co_changes:");
    expect(abEdge!.evidence).toContain("recency_score:");
    expect(abEdge!.evidence).toContain("window:");

    // a.ts <-> c.ts only co-changed once (< threshold) — no edge
    const cId = nodeId("src/c.ts", "src/c.ts", 1);
    const acEdge = edges.find((e) => (e.source === aId && e.target === cId) || (e.source === cId && e.target === aId));
    expect(acEdge).toBeUndefined();
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runGitCoChangeStage applies recency weighting (recent commits count more)", async () => {
  const root = createTestRepo();
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1" });
    store.addNode({ id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2" });
    store.setFileHash("src/a.ts", "h1");
    store.setFileHash("src/b.ts", "h2");

    const { runGitCoChangeStage } = await import("../src/indexer/git.js");
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });

    const edges = store.queryRows<{ evidence: string }>(
      "SELECT evidence FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(edges.length).toBeGreaterThan(0);

    // Parse recency_score from evidence — it should be > 0 (recent commits have weight)
    const match = edges[0]!.evidence.match(/recency_score:\s*([\d.]+)/);
    expect(match).toBeTruthy();
    expect(parseFloat(match![1])).toBeGreaterThan(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-git-cochange.test.ts`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'runGitCoChangeStage')` or module not found error, since `src/indexer/git.ts` doesn't exist yet.

**Step 3 — Write minimal implementation**

Create `src/indexer/git.ts`:

```ts
import { execSync } from "node:child_process";
import type { GraphStore } from "../graph/store.js";
import { nodeId } from "../graph/types.js";

export interface GitCoChangeOptions {
  minCoChangeCount?: number;
  windowDays?: number;
}

interface CommitRecord {
  hash: string;
  dateIso: string;
  files: string[];
}

function parseGitLog(projectRoot: string): CommitRecord[] {
  let stdout: string;
  try {
    stdout = execSync(
      'git log --name-only --format="__COMMIT__%H %aI" --diff-filter=AMRT',
      { cwd: projectRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
    );
  } catch {
    return [];
  }

  const records: CommitRecord[] = [];
  let current: CommitRecord | null = null;

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("__COMMIT__")) {
      if (current && current.files.length > 0) records.push(current);
      const rest = line.slice("__COMMIT__".length);
      const spaceIdx = rest.indexOf(" ");
      const hash = rest.slice(0, spaceIdx);
      const dateIso = rest.slice(spaceIdx + 1);
      current = { hash, dateIso, files: [] };
    } else if (current) {
      current.files.push(line.split("\\").join("/"));
    }
  }
  if (current && current.files.length > 0) records.push(current);

  return records;
}

function computeDecayWeight(commitDateIso: string, now: number, halfLifeDays: number): number {
  const commitTime = new Date(commitDateIso).getTime();
  const ageDays = (now - commitTime) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export async function runGitCoChangeStage(
  store: GraphStore,
  projectRoot: string,
  options: GitCoChangeOptions = {},
): Promise<void> {
  const minCount = options.minCoChangeCount ?? 2;
  const windowDays = options.windowDays ?? 365;

  const commits = parseGitLog(projectRoot);
  if (commits.length === 0) return;

  const now = Date.now();
  const halfLifeDays = windowDays / 4; // half-life at 1/4 of window

  // Filter to tracked files
  const trackedFiles = new Set(store.listFiles());

  // Build co-occurrence matrix
  const pairCounts = new Map<string, { count: number; weightedScore: number }>();

  for (const commit of commits) {
    const relevantFiles = commit.files.filter((f) => trackedFiles.has(f)).sort();
    if (relevantFiles.length < 2) continue;

    const weight = computeDecayWeight(commit.dateIso, now, halfLifeDays);

    for (let i = 0; i < relevantFiles.length; i++) {
      for (let j = i + 1; j < relevantFiles.length; j++) {
        const key = `${relevantFiles[i]}|${relevantFiles[j]}`;
        const existing = pairCounts.get(key) ?? { count: 0, weightedScore: 0 };
        existing.count++;
        existing.weightedScore += weight;
        pairCounts.set(key, existing);
      }
    }
  }

  // Create edges for pairs exceeding threshold
  for (const [key, data] of pairCounts) {
    if (data.count < minCount) continue;
    const [fileA, fileB] = key.split("|");
    const nodeA = store.findNodes(fileA!)[0];
    const nodeB = store.findNodes(fileB!)[0];
    if (!nodeA || !nodeB) continue;

    const evidence = `co_changes: ${data.count}, recency_score: ${data.weightedScore.toFixed(1)}, window: ${windowDays}d`;

    store.addEdge({
      source: nodeA.id,
      target: nodeB.id,
      kind: "co_changes_with",
      provenance: {
        source: "git",
        confidence: Math.min(0.9, 0.3 + data.count * 0.1),
        evidence,
        content_hash: nodeA.content_hash,
      },
      created_at: Date.now(),
    });
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-git-cochange.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 9: Git co-change incremental skip when HEAD unchanged [depends: 8]

**AC:** 7 (incremental co-change indexing)

**Files:**
- Modify: `src/indexer/git.ts`
- Test: `test/indexer-git-incremental.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-git-incremental.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";

function setupRepo(): string {
  const root = join(tmpdir(), `pi-codegraph-git-incr-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  execSync("git init", { cwd: root, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 1;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c1"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 2;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 2;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c2"', { cwd: root, stdio: "ignore" });

  return root;
}

function seedStore(store: SqliteGraphStore): void {
  store.addNode({ id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1" });
  store.addNode({ id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2" });
  store.setFileHash("src/a.ts", "h1");
  store.setFileHash("src/b.ts", "h2");
}

test("runGitCoChangeStage skips re-analysis when HEAD has not changed", async () => {
  const root = setupRepo();
  const store = new SqliteGraphStore();
  try {
    seedStore(store);
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    // First run: should create edges
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges1 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges1.length).toBeGreaterThan(0);

    // Delete the edges manually to detect if re-analysis happens
    store.queryRows("SELECT 1"); // no-op
    for (const e of store.queryRows<{ source: string; target: string; kind: string; provenance_source: string }>(
      "SELECT source, target, kind, provenance_source FROM edges WHERE kind = 'co_changes_with'"
    )) {
      store.deleteEdge(e.source, e.target, e.kind, e.provenance_source);
    }

    // Second run with same HEAD: should skip (edges stay deleted)
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges2 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges2.length).toBe(0); // Skipped — didn't re-create

  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runGitCoChangeStage clears and rebuilds when HEAD changes", async () => {
  const root = setupRepo();
  const store = new SqliteGraphStore();
  try {
    seedStore(store);
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges1 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges1.length).toBeGreaterThan(0);

    // Make a new commit to change HEAD
    writeFileSync(join(root, "src", "a.ts"), "export const a = 3;");
    writeFileSync(join(root, "src", "b.ts"), "export const b = 3;");
    execSync("git add .", { cwd: root, stdio: "ignore" });
    execSync('git commit -m "c3"', { cwd: root, stdio: "ignore" });

    // Run again — should clear old edges and rebuild
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges2 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges2.length).toBeGreaterThan(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-git-incremental.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // Expected: 0, Received: [positive number]` because the current implementation re-analyzes every time (no incrementalism).

**Step 3 — Write minimal implementation**

In `src/indexer/git.ts`, add HEAD tracking using the store's `setFileHash`/`getFileHash` with a special sentinel key:

```ts
const GIT_HEAD_KEY = "__git_cochange_head__";

function getCurrentHead(projectRoot: string): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: projectRoot, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// Update runGitCoChangeStage to check HEAD before analysis:
export async function runGitCoChangeStage(
  store: GraphStore,
  projectRoot: string,
  options: GitCoChangeOptions = {},
): Promise<void> {
  const head = getCurrentHead(projectRoot);
  if (!head) return; // Not a git repo or no commits

  const lastHead = store.getFileHash(GIT_HEAD_KEY);
  if (lastHead === head) return; // HEAD unchanged — skip

  // Clear all old co_changes_with edges from git provenance
  const oldEdges = store.queryRows<{ source: string; target: string }>(
    "SELECT source, target FROM edges WHERE kind = 'co_changes_with' AND provenance_source = 'git'"
  );
  for (const e of oldEdges) {
    store.deleteEdge(e.source, e.target, "co_changes_with", "git");
  }

  const minCount = options.minCoChangeCount ?? 2;
  const windowDays = options.windowDays ?? 365;

  const commits = parseGitLog(projectRoot);
  if (commits.length === 0) {
    store.setFileHash(GIT_HEAD_KEY, head);
    return;
  }

  // ... (rest of co-occurrence logic stays the same)

  // After creating all edges:
  store.setFileHash(GIT_HEAD_KEY, head);
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-git-incremental.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 10: Git co-change graceful handling of non-git directories [depends: 8]

**AC:** 8 (non-git repo graceful handling)

**Files:**
- Test: `test/indexer-git-no-repo.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-git-no-repo.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("runGitCoChangeStage completes without error in a non-git directory", async () => {
  const root = join(tmpdir(), `pi-codegraph-no-git-${Date.now()}`);
  mkdirSync(root, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    // Should not throw
    await runGitCoChangeStage(store, root);

    // Should create no edges
    const edges = store.queryRows<{ source: string }>(
      "SELECT source FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(edges).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runGitCoChangeStage completes without error in a git repo with no commits", async () => {
  const root = join(tmpdir(), `pi-codegraph-empty-git-${Date.now()}`);
  mkdirSync(root, { recursive: true });

  const { execSync } = await import("node:child_process");
  execSync("git init", { cwd: root, stdio: "ignore" });

  const store = new SqliteGraphStore();
  try {
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    await runGitCoChangeStage(store, root);

    const edges = store.queryRows<{ source: string }>(
      "SELECT source FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(edges).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-git-no-repo.test.ts`
Expected: FAIL — This should actually pass with the Task 9 implementation (since `getCurrentHead` returns null for non-git dirs and exits early). If it does pass, this test is still valuable as a regression guard. If the implementation from Task 8 doesn't handle this yet (before Task 9's incremental changes), it may fail with a thrown error from `execSync`.

Note: This test may pass immediately after Task 9 is implemented. The test's value is as a permanent regression guard for AC 8. If it passes at Step 2, skip to Step 5.

**Step 3 — Write minimal implementation**

The implementation should already be covered by Task 8/9's `parseGitLog` and `getCurrentHead` which catch errors from git CLI. Verify that:

1. `getCurrentHead` returns `null` when `git rev-parse HEAD` fails (non-git dir).
2. `parseGitLog` returns `[]` when `git log` fails.
3. `runGitCoChangeStage` returns early on either of those.

If any of these aren't handled, add the appropriate try/catch.

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-git-no-repo.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 11: Wire git co-change stage into pipeline as Stage 5 [depends: 8, 9]

**AC:** 6 (pipeline wiring), 14 (timing instrumentation), 15 (summary counts)

**Files:**
- Modify: `src/indexer/pipeline.ts`
- Test: `test/indexer-pipeline-git-stage.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-pipeline-git-stage.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const noopClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

test("indexProject runs git co-change stage and returns timings", async () => {
  const root = join(tmpdir(), `pi-codegraph-pipeline-git-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });

  execSync("git init", { cwd: root, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 1;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c1"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 2;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 2;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c2"', { cwd: root, stdio: "ignore" });

  const store = new SqliteGraphStore();
  try {
    const result = await indexProject(root, store, { lspClientFactory: () => noopClient });

    // Result should have timings for all 5 stages
    expect(result.timings).toBeDefined();
    expect(typeof result.timings["tree-sitter"]).toBe("number");
    expect(typeof result.timings["lsp"]).toBe("number");
    expect(typeof result.timings["ast-grep"]).toBe("number");
    expect(typeof result.timings["coverage"]).toBe("number");
    expect(typeof result.timings["git"]).toBe("number");

    // All timings should be non-negative
    for (const [, ms] of Object.entries(result.timings)) {
      expect(ms).toBeGreaterThanOrEqual(0);
    }

    // Summary counts still present
    expect(result.indexed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.errors).toBe(0);

    // Git stage should have created co_changes_with edges
    const cochangeEdges = store.queryRows<{ kind: string }>(
      "SELECT kind FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(cochangeEdges.length).toBeGreaterThan(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-pipeline-git-stage.test.ts`
Expected: FAIL — `expect(received).toBeDefined() // Received: undefined` for `result.timings` since the current `indexProject` returns `{ indexed, skipped, removed, errors }` without `timings`.

**Step 3 — Write minimal implementation**

Modify `src/indexer/pipeline.ts`:

1. Update `IndexResult` to include `timings`.
2. Add `performance.now()` timing around each stage.
3. Import and call `runGitCoChangeStage` as Stage 5 after coverage.

```ts
// Update imports:
import { runGitCoChangeStage } from "./git.js";

// Update IndexResult interface:
export interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
  timings: Record<string, number>;
}

// In indexProject, wrap each stage with timing:
export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult> {
  const timings: Record<string, number> = {};

  // Stage 1: tree-sitter
  const tsStart = performance.now();
  const files = walkTsFiles(projectRoot);
  let indexed = 0;
  let skipped = 0;
  let removed = 0;
  let errors = 0;
  const changedFiles: string[] = [];

  const currentRel = new Set(files.map((absPath) => toPosixPath(relative(projectRoot, absPath))));
  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));
    try {
      const content = readFileSync(absPath, "utf8");
      const hash = sha256Hex(content);
      const existing = store.getFileHash(rel);
      if (existing === hash) { skipped++; continue; }
      if (existing !== null) store.deleteFile(rel);
      const extracted = extractFile(rel, content);
      store.addNode(extracted.module);
      for (const node of extracted.nodes) store.addNode(node);
      for (const edge of extracted.edges) store.addEdge(edge);
      store.setFileHash(rel, hash);
      changedFiles.push(rel);
      indexed++;
    } catch { errors++; }
  }
  for (const oldFile of store.listFiles()) {
    if (currentRel.has(oldFile) || oldFile.startsWith("__")) continue;
    try { store.deleteFile(oldFile); removed++; } catch { errors++; }
  }
  timings["tree-sitter"] = Math.round(performance.now() - tsStart);

  // Stage 2: LSP
  const lspStart = performance.now();
  const client = options.lspClientFactory ? options.lspClientFactory(projectRoot) : new TsServerClient(projectRoot);
  try {
    await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  timings["lsp"] = Math.round(performance.now() - lspStart);

  // Stage 3: ast-grep
  const agStart = performance.now();
  await runAstGrepIndexStage(store, projectRoot, changedFiles);
  timings["ast-grep"] = Math.round(performance.now() - agStart);

  // Stage 4: coverage
  const covStart = performance.now();
  runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
  timings["coverage"] = Math.round(performance.now() - covStart);

  // Stage 5: git co-change
  const gitStart = performance.now();
  await runGitCoChangeStage(store, projectRoot);
  timings["git"] = Math.round(performance.now() - gitStart);

  return { indexed, skipped, removed, errors, timings };
}
```

Note: The `listFiles()` cleanup loop needs to skip entries starting with `__` to avoid deleting the `__git_cochange_head__` sentinel used by the git stage.

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-pipeline-git-stage.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing. Note: existing tests that check `indexProject` return value with `toEqual({ indexed, skipped, removed, errors })` will need to be updated to also expect the `timings` field, or use `toMatchObject` instead. The implementation task should update those existing assertions.

### Task 12: Update existing pipeline tests for new IndexResult shape [depends: 11]

**AC:** 15 (summary counts preserved), 19 (regression safety)

**Files:**
- Modify: `test/indexer-index-project.test.ts`

This task updates all existing tests that use strict `toEqual` on `indexProject` return values to use `toMatchObject`, accommodating the new `timings` field.

**Step 1 — Write the failing test**

No new test. The existing tests _are_ the failing tests after Task 11 changes `IndexResult`.

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-index-project.test.ts`
Expected: FAIL — `Expected: {"errors": 0, "indexed": 2, "removed": 0, "skipped": 0}, Received: {"errors": 0, "indexed": 2, "removed": 0, "skipped": 0, "timings": {...}}`

**Step 3 — Write minimal implementation**

In `test/indexer-index-project.test.ts`, change 6 strict `toEqual` calls to `toMatchObject`:

Line 41:
```ts
// Before:
expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
// After:
expect(result).toMatchObject({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
```

Line 86:
```ts
// Before:
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
// After:
await expect(indexProject(root, store)).resolves.toMatchObject({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
```

Line 91:
```ts
// Before:
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 0, skipped: 1, removed: 1, errors: 1 });
// After:
await expect(indexProject(root, store)).resolves.toMatchObject({ indexed: 0, skipped: 1, removed: 1, errors: 1 });
```

Line 131:
```ts
// Before:
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
// After:
await expect(indexProject(root, store)).resolves.toMatchObject({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
```

Line 146:
```ts
// Before:
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
// After:
await expect(indexProject(root, store)).resolves.toMatchObject({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
```

Lines 243-248:
```ts
// Before:
await expect(indexProject(root, store, { lspClientFactory: () => fakeClient })).resolves.toEqual({
  indexed: 1, skipped: 0, removed: 0, errors: 0,
});
// After:
await expect(indexProject(root, store, { lspClientFactory: () => fakeClient })).resolves.toMatchObject({
  indexed: 1, skipped: 0, removed: 0, errors: 0,
});
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-index-project.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
