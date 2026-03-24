# Plan

### Task 1: Add signature field to GraphNode and SQLite schema

### Task 1: Add signature field to GraphNode and SQLite schema

**Files:**
- Modify: `src/graph/types.ts`
- Modify: `src/graph/sqlite.ts`
- Test: `test/signature-schema.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-schema.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";

test("GraphNode signature field exists and SQLite column is nullable", () => {
  const store = new SqliteGraphStore();

  const nodeWithSig: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
    is_exported: false,
    signature: "(x: string) => number",
  };

  store.addNode(nodeWithSig);
  const retrieved = store.getNode(nodeWithSig.id);
  expect(retrieved).not.toBeNull();
  expect(retrieved!.signature).toBe("(x: string) => number");

  // Node without signature — should round-trip as undefined
  const nodeWithoutSig: GraphNode = {
    id: "src/a.ts::bar:5",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
    is_exported: false,
  };

  store.addNode(nodeWithoutSig);
  const retrieved2 = store.getNode(nodeWithoutSig.id);
  expect(retrieved2).not.toBeNull();
  expect(retrieved2!.signature).toBeUndefined();
});

test("signature column is added via migration on existing databases", () => {
  const { mkdirSync, rmSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");
  const { Database } = require("bun:sqlite");

  const dir = join(tmpdir(), "pi-codegraph-tests");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `sig-migration-${Date.now()}.sqlite`);

  try {
    // Create a DB with the old schema (no signature column)
    const rawDb = new Database(dbPath);
    rawDb.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        file TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER,
        content_hash TEXT NOT NULL,
        is_exported INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE edges (
        source TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL,
        provenance_source TEXT NOT NULL, confidence REAL NOT NULL,
        evidence TEXT NOT NULL, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (source, target, kind, provenance_source)
      );
      CREATE TABLE file_hashes (file TEXT PRIMARY KEY, hash TEXT NOT NULL, indexed_at INTEGER NOT NULL);
      CREATE TABLE test_trace_steps (
        test_node_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
        node_id TEXT NOT NULL, content_hash TEXT NOT NULL,
        PRIMARY KEY (test_node_id, ordinal)
      );
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version(version) VALUES (1);
    `);
    rawDb.close();

    // Opening with SqliteGraphStore should migrate
    const store = new SqliteGraphStore(dbPath);
    const node: GraphNode = {
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "h1",
      is_exported: false,
      signature: "(x: string) => void",
    };
    store.addNode(node);
    expect(store.getNode(node.id)!.signature).toBe("(x: string) => void");
    store.close();
  } finally {
    rmSync(dbPath, { force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-schema.test.ts`
Expected: FAIL — Property 'signature' does not exist on type 'GraphNode'

**Step 3 — Write minimal implementation**

In `src/graph/types.ts`, add `signature?: string` to `GraphNode`:

```typescript
export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
  is_exported?: boolean;
  signature?: string;
}
```

In `src/graph/sqlite.ts`, make these changes:

1. In `initSchema()`, add after the `is_exported` migration check:

```typescript
    if (!nodeColumns.some((column) => column.name === "signature")) {
      this.db.prepare("ALTER TABLE nodes ADD COLUMN signature TEXT").run();
    }
```

2. Update `addNode()`:

```typescript
  addNode(node: GraphNode): void {
    this.db.prepare(`INSERT OR REPLACE INTO nodes (id, kind, name, file, start_line, end_line, content_hash, is_exported, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(node.id, node.kind, node.name, node.file, node.start_line, node.end_line ?? null, node.content_hash, node.is_exported ? 1 : 0, node.signature ?? null);
  }
```

3. Update `hydrateNode()` — add `signature` to the row type and return:

```typescript
  private hydrateNode(row: { id: string; kind: GraphNode["kind"]; name: string; file: string; start_line: number; end_line: number | null; content_hash: string; is_exported: number | null; signature: string | null; }): GraphNode {
    const node: GraphNode = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      file: row.file,
      start_line: row.start_line,
      end_line: row.end_line,
      content_hash: row.content_hash,
      is_exported: Boolean(row.is_exported),
    };
    if (row.signature != null) {
      node.signature = row.signature;
    }
    return node;
  }
```

4. Update all SELECT queries on nodes to include `signature`:
   - `getNode()`: add `, signature` to SELECT
   - `findNodes()`: add `, signature` to both SQL strings
   - `getNodesByFile()`: add `, signature` to SELECT
   - `fetchNeighborRows()`: add `n.signature` to SELECT, add `signature` to the `NeighborRow` interface, and add signature handling in the row mapper

For `NeighborRow`, add:
```typescript
  signature: string | null;
```

For the `fetchNeighborRows` mapper, update node construction:
```typescript
      node: (() => {
        const n: GraphNode = {
          id: row.id,
          kind: row.kind,
          name: row.name,
          file: row.file,
          start_line: row.start_line,
          end_line: row.end_line,
          content_hash: row.content_hash,
          is_exported: Boolean(row.is_exported),
        };
        if (row.signature != null) n.signature = row.signature;
        return n;
      })(),
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-schema.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 270+ tests passing

### Task 2: Signature round-trip through findNodes and getNodesByFile [depends: 1]

### Task 2: Signature round-trip through findNodes and getNodesByFile [depends: 1]

**Files:**
- Test: `test/signature-round-trip.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-round-trip.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";

test("signature round-trips through findNodes", () => {
  const store = new SqliteGraphStore();
  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
    is_exported: true,
    signature: "(x: string, y: number) => boolean",
  };
  store.addNode(node);

  const found = store.findNodes("foo");
  expect(found).toHaveLength(1);
  expect(found[0]!.signature).toBe("(x: string, y: number) => boolean");

  const foundByFile = store.findNodes("foo", "src/a.ts");
  expect(foundByFile).toHaveLength(1);
  expect(foundByFile[0]!.signature).toBe("(x: string, y: number) => boolean");
});

test("signature round-trips through getNodesByFile", () => {
  const store = new SqliteGraphStore();
  const node: GraphNode = {
    id: "src/a.ts::bar:5",
    kind: "class",
    name: "bar",
    file: "src/a.ts",
    start_line: 5,
    end_line: 10,
    content_hash: "h2",
    is_exported: false,
    signature: "class bar extends Base { constructor(name: string) }",
  };
  store.addNode(node);

  const fileNodes = store.getNodesByFile("src/a.ts");
  expect(fileNodes).toHaveLength(1);
  expect(fileNodes[0]!.signature).toBe("class bar extends Base { constructor(name: string) }");
});

test("signature round-trips through getNeighbors", () => {
  const store = new SqliteGraphStore();
  const n1: GraphNode = {
    id: "src/a.ts::caller:1",
    kind: "function",
    name: "caller",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
    is_exported: false,
    signature: "(x: number) => void",
  };
  const n2: GraphNode = {
    id: "src/a.ts::callee:5",
    kind: "function",
    name: "callee",
    file: "src/a.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
    is_exported: false,
    signature: "(y: string) => boolean",
  };
  store.addNode(n1);
  store.addNode(n2);
  store.addEdge({
    source: n1.id,
    target: n2.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "test", content_hash: "h1" },
    created_at: Date.now(),
  });

  const neighbors = store.getNeighbors(n1.id, { direction: "out" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.node.signature).toBe("(y: string) => boolean");
});

test("nodes without signature have undefined signature field", () => {
  const store = new SqliteGraphStore();
  const node: GraphNode = {
    id: "src/a.ts::mod:1",
    kind: "module",
    name: "src/a.ts",
    file: "src/a.ts",
    start_line: 1,
    end_line: 10,
    content_hash: "h1",
    is_exported: false,
  };
  store.addNode(node);

  const retrieved = store.getNode(node.id);
  expect(retrieved).not.toBeNull();
  expect(retrieved!.signature).toBeUndefined();
  expect("signature" in retrieved!).toBe(false);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-round-trip.test.ts`
Expected: FAIL — if Task 1 is not yet implemented, signature field won't exist on GraphNode type. If Task 1 is implemented, these tests should pass immediately (verifying the queries work).

Note: These tests serve as the verification layer for AC 3, AC 10, AC 11, and AC 12. They may pass immediately after Task 1 is implemented since Task 1 updates all the queries. That's acceptable — the tests still add regression value.

**Step 3 — Write minimal implementation**

No additional production code needed — Task 1's implementation covers all the query updates. This task's value is the comprehensive test coverage of round-trip paths.

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-round-trip.test.ts`
Expected: PASS — all 4 tests pass

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 3: Extract signature for function declarations [depends: 1]

### Task 3: Extract signature for function declarations [depends: 1]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/signature-extract-function.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-extract-function.test.ts
import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for typed function declaration", () => {
  const result = extractFile("src/a.ts", "function foo(x: string, y: number): boolean { return true; }");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x: string, y: number) => boolean");
});

test("extractFile produces signature for function with no return type", () => {
  const result = extractFile("src/a.ts", "function foo(x: string) { return x; }");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x: string)");
});

test("extractFile produces signature for function with no type annotations", () => {
  const result = extractFile("src/a.ts", "function foo(x, y) { return x; }");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x, y)");
});

test("extractFile produces signature for function with no params", () => {
  const result = extractFile("src/a.ts", "function foo(): void {}");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("() => void");
});

test("extractFile produces signature for exported function", () => {
  const result = extractFile("src/a.ts", "export function greet(name: string): string { return name; }");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(name: string) => string");
});

test("extractFile produces signature for function with optional param", () => {
  const result = extractFile("src/a.ts", "function foo(x: string, y?: number): void {}");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x: string, y?: number) => void");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-extract-function.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` where `received` is `undefined` (no signature extraction yet)

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`:

1. Update the `addNode` helper to accept an optional signature:

```typescript
function addNode(
  nodes: GraphNode[],
  file: string,
  kind: NodeKind,
  name: string,
  startLine: number,
  endLine: number,
  contentHash: string,
  isExported: boolean,
  signature?: string
): void {
  const node: GraphNode = {
    id: nodeId(file, name, startLine),
    kind,
    name,
    file,
    start_line: startLine,
    end_line: endLine,
    content_hash: contentHash,
    is_exported: isExported,
  };
  if (signature != null) {
    node.signature = signature;
  }
  nodes.push(node);
}
```

2. Add a helper function to extract function signatures from AST nodes:

```typescript
function extractFunctionSignature(node: SyntaxNode): string | undefined {
  const params = node.childForFieldName("parameters");
  if (!params) return undefined;

  const paramParts: string[] = [];
  for (const child of params.namedChildren) {
    if (child.type === "required_parameter" || child.type === "optional_parameter") {
      const nameNode = child.namedChildren.find((c: SyntaxNode) => c.type === "identifier");
      const typeAnnotation = child.namedChildren.find((c: SyntaxNode) => c.type === "type_annotation");
      if (!nameNode) continue;
      const optional = child.type === "optional_parameter" && !typeAnnotation ? "?" : "";
      const questionMark = child.type === "optional_parameter" ? "?" : "";
      const typeStr = typeAnnotation ? typeAnnotation.text.replace(/^\s*:\s*/, "") : "";
      if (typeStr) {
        paramParts.push(`${nameNode.text}${questionMark}: ${typeStr}`);
      } else {
        paramParts.push(`${nameNode.text}${questionMark}`);
      }
    }
  }

  const returnType = node.childForFieldName("return_type");
  const returnStr = returnType ? returnType.text.replace(/^\s*:\s*/, "") : "";

  if (returnStr) {
    return `(${paramParts.join(", ")}) => ${returnStr}`;
  }
  return `(${paramParts.join(", ")})`;
}
```

3. Update the `function_declaration` handler in the walk callback:

```typescript
      if (n.type === "function_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        const signature = extractFunctionSignature(n);
        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash,
          isExportedNode(n),
          signature
        );
        return;
      }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-extract-function.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 4: Extract signature for arrow functions [depends: 3]

### Task 4: Extract signature for arrow functions [depends: 3]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/signature-extract-arrow.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-extract-arrow.test.ts
import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for typed arrow function", () => {
  const result = extractFile("src/a.ts", "const greet = (name: string): string => name;");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.name).toBe("greet");
  expect(result.nodes[0]!.signature).toBe("(name: string) => string");
});

test("extractFile produces signature for arrow function without return type", () => {
  const result = extractFile("src/a.ts", "const greet = (name: string) => name;");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(name: string)");
});

test("extractFile produces signature for arrow function with no types", () => {
  const result = extractFile("src/a.ts", "const fn = (x, y) => x + y;");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x, y)");
});

test("extractFile produces signature for async arrow function", () => {
  const result = extractFile("src/a.ts", "const fetch = async (url: string): Promise<Response> => { return new Response(); };");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(url: string) => Promise<Response>");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-extract-arrow.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` where `received` is `undefined` (arrow function handler doesn't pass signature yet)

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, update the `variable_declarator` handler in the walk callback. The arrow function node has `parameters` and `return_type` fields just like `function_declaration`, so `extractFunctionSignature` works directly:

```typescript
      if (n.type === "variable_declarator") {
        const nameNode = n.childForFieldName("name");
        const valueNode = n.childForFieldName("value");

        if (nameNode?.type !== "identifier") return;
        if (valueNode?.type !== "arrow_function") return;

        const signature = extractFunctionSignature(valueNode);
        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          valueNode.endPosition.row + 1,
          contentHash,
          isExportedNode(n),
          signature
        );
      }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-extract-arrow.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 5: Extract signature for class declarations [depends: 3]

### Task 5: Extract signature for class declarations [depends: 3]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/signature-extract-class.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-extract-class.test.ts
import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for class with constructor and heritage", () => {
  const code = "class MyService extends Base implements IService { constructor(private db: Database, name: string) {} doWork() {} }";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "MyService");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class MyService extends Base implements IService { constructor(db: Database, name: string) }");
});

test("extractFile produces signature for class without constructor", () => {
  const code = "class Empty extends Base {}";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "Empty");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class Empty extends Base");
});

test("extractFile produces signature for class with no heritage and no constructor", () => {
  const code = "class Plain {}";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "Plain");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class Plain");
});

test("extractFile produces signature for class with implements only", () => {
  const code = "class Impl implements IFoo, IBar { constructor(x: number) {} }";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "Impl");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class Impl implements IFoo, IBar { constructor(x: number) }");
});

test("extractFile produces signature for class with extends only", () => {
  const code = "class Child extends Parent { constructor() {} }";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "Child");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class Child extends Parent { constructor() }");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-extract-class.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` where `received` is `undefined` (class handler doesn't extract signatures yet)

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, add a helper to extract class signatures:

```typescript
function extractClassSignature(node: SyntaxNode, name: string): string {
  const parts: string[] = [`class ${name}`];

  // Heritage clauses
  const heritage = node.namedChildren.find((c: SyntaxNode) => c.type === "class_heritage");
  if (heritage) {
    const extendsClause = heritage.namedChildren.find((c: SyntaxNode) => c.type === "extends_clause");
    if (extendsClause) {
      // Get everything after "extends "
      const extendsText = extendsClause.text.replace(/^extends\s+/, "");
      parts.push(`extends ${extendsText}`);
    }
    const implClause = heritage.namedChildren.find((c: SyntaxNode) => c.type === "implements_clause");
    if (implClause) {
      const implText = implClause.text.replace(/^implements\s+/, "");
      parts.push(`implements ${implText}`);
    }
  }

  // Constructor
  const classBody = node.childForFieldName("body");
  if (classBody) {
    for (const member of classBody.namedChildren) {
      if (member.type === "method_definition") {
        const methodName = member.childForFieldName("name");
        if (methodName && methodName.text === "constructor") {
          const params = member.childForFieldName("parameters");
          if (params) {
            const paramParts: string[] = [];
            for (const child of params.namedChildren) {
              if (child.type === "required_parameter" || child.type === "optional_parameter") {
                // Skip access modifiers — just get name + type
                const nameChild = child.namedChildren.find((c: SyntaxNode) => c.type === "identifier");
                const typeAnnotation = child.namedChildren.find((c: SyntaxNode) => c.type === "type_annotation");
                if (!nameChild) continue;
                const questionMark = child.type === "optional_parameter" ? "?" : "";
                const typeStr = typeAnnotation ? typeAnnotation.text.replace(/^\s*:\s*/, "") : "";
                if (typeStr) {
                  paramParts.push(`${nameChild.text}${questionMark}: ${typeStr}`);
                } else {
                  paramParts.push(`${nameChild.text}${questionMark}`);
                }
              }
            }
            parts.push(`{ constructor(${paramParts.join(", ")}) }`);
          }
          break;
        }
      }
    }
  }

  return parts.join(" ");
}
```

Update the `class_declaration` handler in the walk callback:

```typescript
      if (n.type === "class_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        const signature = extractClassSignature(n, nameNode.text);
        addNode(
          nodes,
          file,
          "class",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash,
          isExportedNode(n),
          signature
        );
        return;
      }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-extract-class.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 6: Extract signature for interface declarations [depends: 1]

### Task 6: Extract signature for interface declarations [depends: 1]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/signature-extract-interface.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-extract-interface.test.ts
import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for interface with extends", () => {
  const code = "interface MyInterface extends Base {}";
  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find(n => n.name === "MyInterface");
  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe("interface MyInterface extends Base");
});

test("extractFile produces signature for interface with multiple extends", () => {
  const code = "interface Combined extends Foo, Bar {}";
  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find(n => n.name === "Combined");
  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe("interface Combined extends Foo, Bar");
});

test("extractFile produces signature for interface without extends", () => {
  const code = "interface Plain { x: number; }";
  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find(n => n.name === "Plain");
  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe("interface Plain");
});

test("extractFile produces signature for exported interface", () => {
  const code = "export interface Exported extends Base {}";
  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find(n => n.name === "Exported");
  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe("interface Exported extends Base");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-extract-interface.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` where `received` is `undefined`

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, add a helper to extract interface signatures:

```typescript
function extractInterfaceSignature(node: SyntaxNode, name: string): string {
  const extendsClause = node.namedChildren.find((c: SyntaxNode) => c.type === "extends_type_clause");
  if (extendsClause) {
    const types = extendsClause.namedChildren
      .filter((c: SyntaxNode) => c.type === "type_identifier" || c.type === "generic_type")
      .map((c: SyntaxNode) => c.text);
    if (types.length > 0) {
      return `interface ${name} extends ${types.join(", ")}`;
    }
  }
  return `interface ${name}`;
}
```

Update the `interface_declaration` handler in the walk callback:

```typescript
      if (n.type === "interface_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        const signature = extractInterfaceSignature(n, nameNode.text);
        addNode(
          nodes,
          file,
          "interface",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash,
          isExportedNode(n),
          signature
        );
        return;
      }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-extract-interface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 7: Extract type parameters in function signatures [depends: 3]

### Task 7: Extract type parameters in function signatures [depends: 3]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/signature-extract-generics.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-extract-generics.test.ts
import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for generic function", () => {
  const code = "function identity<T>(value: T): T { return value; }";
  const result = extractFile("src/a.ts", code);
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("<T>(value: T) => T");
});

test("extractFile produces signature for generic function with constraint", () => {
  const code = 'function query<T extends Record<string, unknown>>(items: T[]): T { return items[0]; }';
  const result = extractFile("src/a.ts", code);
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("<T extends Record<string, unknown>>(items: T[]) => T");
});

test("extractFile produces signature for generic arrow function", () => {
  const code = "const wrap = <T>(value: T): T[] => [value];";
  const result = extractFile("src/a.ts", code);
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("<T>(value: T) => T[]");
});

test("extractFile produces signature for multi-type-param function", () => {
  const code = "function map<K, V>(key: K, value: V): [K, V] { return [key, value]; }";
  const result = extractFile("src/a.ts", code);
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("<K, V>(key: K, value: V) => [K, V]");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-extract-generics.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` — the current `extractFunctionSignature` doesn't include type parameters, so generic signatures will be missing the `<T>` prefix

**Step 3 — Write minimal implementation**

Update `extractFunctionSignature` in `src/indexer/tree-sitter.ts` to prepend type parameters:

```typescript
function extractFunctionSignature(node: SyntaxNode): string | undefined {
  const params = node.childForFieldName("parameters");
  if (!params) return undefined;

  // Type parameters (generics)
  const typeParams = node.namedChildren.find((c: SyntaxNode) => c.type === "type_parameters");
  const typeParamStr = typeParams ? typeParams.text : "";

  const paramParts: string[] = [];
  for (const child of params.namedChildren) {
    if (child.type === "required_parameter" || child.type === "optional_parameter") {
      const nameNode = child.namedChildren.find((c: SyntaxNode) => c.type === "identifier");
      const typeAnnotation = child.namedChildren.find((c: SyntaxNode) => c.type === "type_annotation");
      if (!nameNode) continue;
      const questionMark = child.type === "optional_parameter" ? "?" : "";
      const typeStr = typeAnnotation ? typeAnnotation.text.replace(/^\s*:\s*/, "") : "";
      if (typeStr) {
        paramParts.push(`${nameNode.text}${questionMark}: ${typeStr}`);
      } else {
        paramParts.push(`${nameNode.text}${questionMark}`);
      }
    }
  }

  const returnType = node.childForFieldName("return_type");
  const returnStr = returnType ? returnType.text.replace(/^\s*:\s*/, "") : "";

  const paramList = `(${paramParts.join(", ")})`;

  if (returnStr) {
    return `${typeParamStr}${paramList} => ${returnStr}`;
  }
  return `${typeParamStr}${paramList}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-extract-generics.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing

### Task 8: Module nodes have no signature [depends: 3]

### Task 8: Module nodes have no signature [depends: 3]

**Files:**
- Test: `test/signature-extract-module.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-extract-module.test.ts
import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("module node has no signature (undefined, not empty string)", () => {
  const result = extractFile("src/a.ts", "const x = 1;");
  expect(result.module.signature).toBeUndefined();
  expect("signature" in result.module).toBe(false);
});

test("function node without any type annotations still gets a param-only signature", () => {
  const result = extractFile("src/a.ts", "function foo() {}");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("()");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-extract-module.test.ts`
Expected: FAIL if module node somehow has a signature. If the implementation from Task 3 already leaves `module` without a signature, this may pass immediately — the test still adds regression value for AC 12.

**Step 3 — Write minimal implementation**

No production code needed — the module node is created directly (not through the extraction handlers), so it naturally lacks a signature. This test verifies the invariant.

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-extract-module.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
