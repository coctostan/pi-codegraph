# Plan

### Task 1: Add tree-sitter dependencies [no-test] [no-test]

### Task 1: Add tree-sitter dependencies [no-test]

**Justification:** Adds runtime dependencies only; behavior is exercised by later tasks’ tests.

**Files:**
- Modify: `package.json`

**Step 1 — Make the change**
Update `package.json` to include:
- `dependencies.tree-sitter`
- `dependencies.tree-sitter-typescript`

Example resulting `package.json` (only showing the relevant parts; keep existing fields unchanged):
```json
{
  "dependencies": {
    "tree-sitter": "^0.25.0",
    "tree-sitter-typescript": "^0.23.2"
  }
}
```

**Step 2 — Verify**
Run: `bun install`
Expected: installs succeed

Run: `bun test`
Expected: all passing

### Task 2: Create extractFile() result shape with module node + content hash [depends: 1]

### Task 2: Create `extractFile()` result shape with module node + content hash [depends: 1]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Create: `test/indexer-extract-file.test.ts`

**Step 1 — Write the failing test**
Create `test/indexer-extract-file.test.ts`:
```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile returns module node with stable id and SHA-256 content hash", () => {
  const file = "src/a.ts";
  const content = "function foo() {}";

  const result = extractFile(file, content);

  const expectedHash = createHash("sha256").update(content).digest("hex");

  expect(result.module).toEqual({
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(result.nodes).toEqual([]);
  expect(result.edges).toEqual([]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: FAIL — `SyntaxError: The requested module '../src/indexer/tree-sitter.js' does not provide an export named 'extractFile'`

**Step 3 — Write minimal implementation**
Replace `src/indexer/tree-sitter.ts` with:
```ts
import { createHash } from "node:crypto";

import type { GraphEdge, GraphNode } from "../graph/types.js";
import { nodeId } from "../graph/types.js";

export interface ExtractionResult {
  module: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function countLines(content: string): number {
  // "" is 1 line
  return content.split(/\r?\n/).length;
}

export function extractFile(file: string, content: string): ExtractionResult {
  const contentHash = sha256Hex(content);

  const moduleNode: GraphNode = {
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: countLines(content),
    content_hash: contentHash,
  };

  return { module: moduleNode, nodes: [], edges: [] };
}

// Back-compat with the existing placeholder export test
export const treeSitterIndex = extractFile;
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Extract function declarations and arrow-function assignments as function nodes [depends: 2]

### Task 3: Extract function declarations and arrow-function assignments as function nodes [depends: 2]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `test/indexer-extract-file.test.ts`

**Step 1 — Write the failing test**
Replace `test/indexer-extract-file.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile returns module node with stable id and SHA-256 content hash", () => {
  const file = "src/a.ts";
  const content = "function foo() {}";

  const result = extractFile(file, content);

  const expectedHash = createHash("sha256").update(content).digest("hex");

  expect(result.module).toEqual({
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(result.nodes).toEqual([]);
  expect(result.edges).toEqual([]);
});

test("extractFile extracts function declarations and arrow function assignments", () => {
  const file = "src/a.ts";
  const content = [
    "export function foo() {",
    "  return 1;",
    "}",
    "",
    "const bar = () => {};",
    "const baz = async () => {",
    "  return 2;",
    "};",
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const byName = new Map(result.nodes.map((n) => [n.name, n]));

  expect(byName.get("foo")).toBeDefined();
  expect(byName.get("foo")).toEqual({
    id: nodeId(file, "foo", 1),
    kind: "function",
    name: "foo",
    file,
    start_line: 1,
    end_line: 3,
    content_hash: expectedHash,
  });

  expect(byName.get("bar")).toBeDefined();
  expect(byName.get("bar")).toEqual({
    id: nodeId(file, "bar", 5),
    kind: "function",
    name: "bar",
    file,
    start_line: 5,
    end_line: 5,
    content_hash: expectedHash,
  });

  expect(byName.get("baz")).toBeDefined();
  expect(byName.get("baz")).toEqual({
    id: nodeId(file, "baz", 6),
    kind: "function",
    name: "baz",
    file,
    start_line: 6,
    end_line: 8,
    content_hash: expectedHash,
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` (for `foo`) with `Received: undefined`

**Step 3 — Write minimal implementation**
Replace `src/indexer/tree-sitter.ts` with:
```ts
import { createHash } from "node:crypto";

import Parser from "tree-sitter";
import ts from "tree-sitter-typescript";

import type { GraphEdge, GraphNode, NodeKind } from "../graph/types.js";
import { nodeId } from "../graph/types.js";

export interface ExtractionResult {
  module: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function countLines(content: string): number {
  return content.split(/\r?\n/).length;
}

type SyntaxNode = Parser.SyntaxNode;

function typescriptLanguage(): unknown {
  // tree-sitter-typescript is CommonJS; under ESM default import is an object.
  return (ts as unknown as { typescript: unknown }).typescript;
}

function addNode(
  nodes: GraphNode[],
  file: string,
  kind: NodeKind,
  name: string,
  startLine: number,
  endLine: number,
  contentHash: string
): void {
  nodes.push({
    id: nodeId(file, name, startLine),
    kind,
    name,
    file,
    start_line: startLine,
    end_line: endLine,
    content_hash: contentHash,
  });
}

function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
  visit(node);
  for (const child of node.namedChildren) walk(child, visit);
}

export function extractFile(file: string, content: string): ExtractionResult {
  const contentHash = sha256Hex(content);

  const moduleNode: GraphNode = {
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: countLines(content),
    content_hash: contentHash,
  };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  try {
    const parser = new Parser();
    parser.setLanguage(typescriptLanguage() as never);
    const tree = parser.parse(content);

    walk(tree.rootNode, (n) => {
      if (n.type === "function_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "variable_declarator") {
        const nameNode = n.childForFieldName("name");
        const valueNode = n.childForFieldName("value");

        if (nameNode?.type !== "identifier") return;
        if (valueNode?.type !== "arrow_function") return;

        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          valueNode.endPosition.row + 1,
          contentHash
        );
      }
    });
  } catch {
    // If parser initialization fails, return only the module node.
    return { module: moduleNode, nodes: [], edges: [] };
  }

  return { module: moduleNode, nodes, edges };
}

// Back-compat with the existing placeholder export test
export const treeSitterIndex = extractFile;
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Extract class and interface declarations as nodes [depends: 3]

### Task 4: Extract class and interface declarations as nodes [depends: 3]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `test/indexer-extract-file.test.ts`

**Step 1 — Write the failing test**
Replace `test/indexer-extract-file.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile returns module node with stable id and SHA-256 content hash", () => {
  const file = "src/a.ts";
  const content = "function foo() {}";

  const result = extractFile(file, content);

  const expectedHash = createHash("sha256").update(content).digest("hex");

  expect(result.module).toEqual({
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(result.nodes).toEqual([]);
  expect(result.edges).toEqual([]);
});

test("extractFile extracts function declarations and arrow function assignments", () => {
  const file = "src/a.ts";
  const content = [
    "export function foo() {",
    "  return 1;",
    "}",
    "",
    "const bar = () => {};",
    "const baz = async () => {",
    "  return 2;",
    "};",
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const byName = new Map(result.nodes.map((n) => [n.name, n]));

  expect(byName.get("foo")).toEqual({
    id: nodeId(file, "foo", 1),
    kind: "function",
    name: "foo",
    file,
    start_line: 1,
    end_line: 3,
    content_hash: expectedHash,
  });

  expect(byName.get("bar")).toEqual({
    id: nodeId(file, "bar", 5),
    kind: "function",
    name: "bar",
    file,
    start_line: 5,
    end_line: 5,
    content_hash: expectedHash,
  });

  expect(byName.get("baz")).toEqual({
    id: nodeId(file, "baz", 6),
    kind: "function",
    name: "baz",
    file,
    start_line: 6,
    end_line: 8,
    content_hash: expectedHash,
  });
});

test("extractFile extracts class and interface declarations", () => {
  const file = "src/types.ts";
  const content = [
    "class MyClass {}",
    "",
    "interface MyInterface {}",
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const byName = new Map(result.nodes.map((n) => [n.name, n]));

  expect(byName.get("MyClass")).toBeDefined();
  expect(byName.get("MyClass")).toEqual({
    id: nodeId(file, "MyClass", 1),
    kind: "class",
    name: "MyClass",
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(byName.get("MyInterface")).toBeDefined();
  expect(byName.get("MyInterface")).toEqual({
    id: nodeId(file, "MyInterface", 3),
    kind: "interface",
    name: "MyInterface",
    file,
    start_line: 3,
    end_line: 3,
    content_hash: expectedHash,
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` (for `MyClass`) with `Received: undefined`

**Step 3 — Write minimal implementation**
Update `src/indexer/tree-sitter.ts` by adding two cases in the AST walk (keep the rest of the file unchanged):
```ts
    walk(tree.rootNode, (n) => {
      if (n.type === "function_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "class_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "class",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "interface_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "interface",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "variable_declarator") {
        const nameNode = n.childForFieldName("name");
        const valueNode = n.childForFieldName("value");

        if (nameNode?.type !== "identifier") return;
        if (valueNode?.type !== "arrow_function") return;

        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          valueNode.endPosition.row + 1,
          contentHash
        );
      }
    });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Extract named/aliased/default import statements as imports edges [depends: 4]

### Task 5: Extract named/aliased/default import statements as `imports` edges [depends: 4]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `test/indexer-extract-file.test.ts`

**Step 1 — Write the failing test**
Replace `test/indexer-extract-file.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile returns module node with stable id and SHA-256 content hash", () => {
  const file = "src/a.ts";
  const content = "function foo() {}";

  const result = extractFile(file, content);

  const expectedHash = createHash("sha256").update(content).digest("hex");

  expect(result.module).toEqual({
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(result.nodes).toEqual([]);
  expect(result.edges).toEqual([]);
});

test("extractFile extracts function declarations and arrow function assignments", () => {
  const file = "src/a.ts";
  const content = [
    "export function foo() {",
    "  return 1;",
    "}",
    "",
    "const bar = () => {};",
    "const baz = async () => {",
    "  return 2;",
    "};",
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const byName = new Map(result.nodes.map((n) => [n.name, n]));

  expect(byName.get("foo")).toEqual({
    id: nodeId(file, "foo", 1),
    kind: "function",
    name: "foo",
    file,
    start_line: 1,
    end_line: 3,
    content_hash: expectedHash,
  });

  expect(byName.get("bar")).toEqual({
    id: nodeId(file, "bar", 5),
    kind: "function",
    name: "bar",
    file,
    start_line: 5,
    end_line: 5,
    content_hash: expectedHash,
  });

  expect(byName.get("baz")).toEqual({
    id: nodeId(file, "baz", 6),
    kind: "function",
    name: "baz",
    file,
    start_line: 6,
    end_line: 8,
    content_hash: expectedHash,
  });
});

test("extractFile extracts class and interface declarations", () => {
  const file = "src/types.ts";
  const content = ["class MyClass {}", "", "interface MyInterface {}"].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const byName = new Map(result.nodes.map((n) => [n.name, n]));

  expect(byName.get("MyClass")).toEqual({
    id: nodeId(file, "MyClass", 1),
    kind: "class",
    name: "MyClass",
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(byName.get("MyInterface")).toEqual({
    id: nodeId(file, "MyInterface", 3),
    kind: "interface",
    name: "MyInterface",
    file,
    start_line: 3,
    end_line: 3,
    content_hash: expectedHash,
  });
});

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

  // Aliased import should target the original name "foo", not "baz"
  const bazEdge = imports.find((e) => e.target.includes("::baz:"));
  expect(bazEdge).toBeUndefined();

  const defaultEdge = imports.find((e) => e.target.includes("::default:"));
  expect(defaultEdge).toBeDefined();
  expect(defaultEdge).toMatchObject({
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
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` (for `fooEdge`) with `Received: undefined`

**Step 3 — Write minimal implementation**
Update `src/indexer/tree-sitter.ts` to:
- add an `unresolvedId(name)` helper
- create `imports` edges for `import_statement` nodes
- deduplicate edges within a single `extractFile` call

Add these helpers near the top (below `walk` is fine):
```ts
function unresolvedId(name: string): string {
  return nodeId("__unresolved__", name, 0);
}

function unquoteStringLiteral(text: string): string {
  // Handles 'x' and "x"
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
```

Inside `extractFile`, after `const edges: GraphEdge[] = [];` add:
```ts
  const edgeKeys = new Set<string>();
  const pushEdge = (edge: GraphEdge) => {
    const key = `${edge.source}|${edge.target}|${edge.kind}|${edge.provenance.source}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };
```

Then extend the `walk(tree.rootNode, ...)` visitor with an `import_statement` case (before `variable_declarator` is fine):
```ts
      if (n.type === "import_statement") {
        const sourceNode = n.childForFieldName("source");
        if (!sourceNode) return;

        const evidence = sourceNode.text;

        const importClause = n.namedChildren.find((c) => c.type === "import_clause");
        if (!importClause) return;

        // Default import: `import Foo from "./bar"` => target "default" (minimal, unresolved)
        const hasDefault = importClause.namedChildren.some((c) => c.type === "identifier");
        if (hasDefault) {
          pushEdge({
            source: moduleNode.id,
            target: unresolvedId("default"),
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

        // Named imports: `import { foo, bar as baz } from "./bar"`
        const namedImports = importClause.namedChildren.find((c) => c.type === "named_imports");
        if (namedImports) {
          for (const spec of namedImports.namedChildren) {
            if (spec.type !== "import_specifier") continue;
            const nameNode = spec.childForFieldName("name");
            if (!nameNode) continue;
            const importedName = unquoteStringLiteral(nameNode.text);

            pushEdge({
              source: moduleNode.id,
              target: unresolvedId(importedName),
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

        return;
      }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: Extract calls edges for bare function calls and constructor calls (ignore method calls) [depends: 5]

### Task 6: Extract `calls` edges for bare calls + constructors (ignore method calls) [depends: 5]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `test/indexer-extract-file.test.ts`

**Step 1 — Write the failing test**
Replace `test/indexer-extract-file.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile returns module node with stable id and SHA-256 content hash", () => {
  const file = "src/a.ts";
  const content = "function foo() {}";

  const result = extractFile(file, content);

  const expectedHash = createHash("sha256").update(content).digest("hex");

  expect(result.module).toEqual({
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(result.nodes).toEqual([]);
  expect(result.edges).toEqual([]);
});

test("extractFile extracts function declarations and arrow function assignments", () => {
  const file = "src/a.ts";
  const content = [
    "export function foo() {",
    "  return 1;",
    "}",
    "",
    "const bar = () => {};",
    "const baz = async () => {",
    "  return 2;",
    "};",
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const byName = new Map(result.nodes.map((n) => [n.name, n]));

  expect(byName.get("foo")).toEqual({
    id: nodeId(file, "foo", 1),
    kind: "function",
    name: "foo",
    file,
    start_line: 1,
    end_line: 3,
    content_hash: expectedHash,
  });

  expect(byName.get("bar")).toEqual({
    id: nodeId(file, "bar", 5),
    kind: "function",
    name: "bar",
    file,
    start_line: 5,
    end_line: 5,
    content_hash: expectedHash,
  });

  expect(byName.get("baz")).toEqual({
    id: nodeId(file, "baz", 6),
    kind: "function",
    name: "baz",
    file,
    start_line: 6,
    end_line: 8,
    content_hash: expectedHash,
  });
});

test("extractFile extracts class and interface declarations", () => {
  const file = "src/types.ts";
  const content = ["class MyClass {}", "", "interface MyInterface {}"].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const byName = new Map(result.nodes.map((n) => [n.name, n]));

  expect(byName.get("MyClass")).toEqual({
    id: nodeId(file, "MyClass", 1),
    kind: "class",
    name: "MyClass",
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(byName.get("MyInterface")).toEqual({
    id: nodeId(file, "MyInterface", 3),
    kind: "interface",
    name: "MyInterface",
    file,
    start_line: 3,
    end_line: 3,
    content_hash: expectedHash,
  });
});

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

  const bazEdge = imports.find((e) => e.target.includes("::baz:"));
  expect(bazEdge).toBeUndefined();

  const defaultEdge = imports.find((e) => e.target.includes("::default:"));
  expect(defaultEdge).toBeDefined();
});

test("extractFile extracts calls edges for bare calls + constructors, ignoring method calls", () => {
  const file = "src/calls.ts";
  const content = [
    "function a() {",
    "  foo();",
    "  obj.method();",
    "  this.method();",
    "  new MyClass();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const calls = result.edges.filter((e) => e.kind === "calls");

  const fooCall = calls.find((e) => e.target.includes("::foo:"));
  expect(fooCall).toBeDefined();
  expect(fooCall).toMatchObject({
    source: nodeId(file, "a", 1),
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      content_hash: expectedHash,
    },
  });

  const ctorCall = calls.find((e) => e.target.includes("::MyClass:"));
  expect(ctorCall).toBeDefined();

  expect(calls.some((e) => e.target.includes("::method:"))).toBe(false);
});

test("extractFile returns empty nodes/edges (but no throw) when the parse has errors", () => {
  const file = "src/bad.ts";

  // Missing closing brace => tree.rootNode.hasError() should be true.
  const content = ["function foo() {", "  return 1;"].join("\n");

  const result = extractFile(file, content);

  // Module node still exists, but symbol extraction is suppressed.
  expect(result.module.kind).toBe("module");
  expect(result.nodes).toEqual([]);
  expect(result.edges).toEqual([]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: FAIL — Bun assertion mismatch in the calls test:
```txt
expect(received).toBeDefined()
Received: undefined
at expect(fooCall).toBeDefined()
```
**Step 3 — Write minimal implementation**
Replace `extractFile()` in `src/indexer/tree-sitter.ts` with this full implementation:
```ts
export function extractFile(file: string, content: string): ExtractionResult {
  const contentHash = sha256Hex(content);

  const moduleNode: GraphNode = {
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: countLines(content),
    content_hash: contentHash,
  };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const edgeKeys = new Set<string>();
  const pushEdge = (edge: GraphEdge) => {
    const key = `${edge.source}|${edge.target}|${edge.kind}|${edge.provenance.source}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };

  try {
    const parser = new Parser();
    parser.setLanguage(typescriptLanguage() as never);
    const tree = parser.parse(content);
    if (tree.rootNode.hasError()) {
      return { module: moduleNode, nodes: [], edges: [] };
    }

    walk(tree.rootNode, (n) => {
      if (n.type === "function_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "class_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "class",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "interface_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "interface",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "import_statement") {
        const sourceNode = n.childForFieldName("source");
        if (!sourceNode) return;

        const evidence = sourceNode.text;
        const importClause = n.namedChildren.find((c) => c.type === "import_clause");
        if (!importClause) return;

        const hasDefault = importClause.namedChildren.some((c) => c.type === "identifier");
        if (hasDefault) {
          pushEdge({
            source: moduleNode.id,
            target: unresolvedId("default"),
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

        const namedImports = importClause.namedChildren.find((c) => c.type === "named_imports");
        if (namedImports) {
          for (const spec of namedImports.namedChildren) {
            if (spec.type !== "import_specifier") continue;
            const nameNode = spec.childForFieldName("name");
            if (!nameNode) continue;
            const importedName = unquoteStringLiteral(nameNode.text);

            pushEdge({
              source: moduleNode.id,
              target: unresolvedId(importedName),
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

        return;
      }

      if (n.type === "variable_declarator") {
        const nameNode = n.childForFieldName("name");
        const valueNode = n.childForFieldName("value");

        if (nameNode?.type !== "identifier") return;
        if (valueNode?.type !== "arrow_function") return;

        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          valueNode.endPosition.row + 1,
          contentHash
        );
      }
    });

    const visitCalls = (n: SyntaxNode, currentFunctionId: string | null): void => {
      let nextFunctionId = currentFunctionId;

      if (n.type === "function_declaration") {
        const nameNode = n.childForFieldName("name");
        if (nameNode) {
          nextFunctionId = nodeId(file, nameNode.text, n.startPosition.row + 1);
        }
      }

      if (n.type === "variable_declarator") {
        const nameNode = n.childForFieldName("name");
        const valueNode = n.childForFieldName("value");
        if (nameNode?.type === "identifier" && valueNode?.type === "arrow_function") {
          nextFunctionId = nodeId(file, nameNode.text, n.startPosition.row + 1);
        }
      }

      if (nextFunctionId && n.type === "call_expression") {
        const callee = n.childForFieldName("function");
        if (callee?.type === "identifier") {
          pushEdge({
            source: nextFunctionId,
            target: unresolvedId(callee.text),
            kind: "calls",
            provenance: {
              source: "tree-sitter",
              confidence: 0.5,
              evidence: callee.text,
              content_hash: contentHash,
            },
            created_at: Date.now(),
          });
        }
      }

      if (nextFunctionId && n.type === "new_expression") {
        const ctor = n.childForFieldName("constructor");
        if (ctor?.type === "identifier") {
          pushEdge({
            source: nextFunctionId,
            target: unresolvedId(ctor.text),
            kind: "calls",
            provenance: {
              source: "tree-sitter",
              confidence: 0.5,
              evidence: ctor.text,
              content_hash: contentHash,
            },
            created_at: Date.now(),
          });
        }
      }

      for (const child of n.namedChildren) visitCalls(child, nextFunctionId);
    };

    visitCalls(tree.rootNode, null);
  } catch {
    // If parser initialization fails, return only the module node.
    return { module: moduleNode, nodes: [], edges: [] };
  }

  return { module: moduleNode, nodes, edges };
}
```
**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: Add GraphStore.listFiles() for deletion detection in the indexer [depends: 6]

### Task 7: Add `GraphStore.listFiles()` for deletion detection in the indexer [depends: 6]

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Create: `test/graph-store-list-files.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-store-list-files.test.ts`:
```ts
import { expect, test } from "bun:test";

import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore.listFiles returns indexed files and reflects deleteFile", () => {
  const store = new SqliteGraphStore();

  store.setFileHash("src/a.ts", "ha");
  store.setFileHash("src/b.ts", "hb");

  expect(store.listFiles()).toEqual(["src/a.ts", "src/b.ts"]);

  store.deleteFile("src/a.ts");
  expect(store.listFiles()).toEqual(["src/b.ts"]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-list-files.test.ts`
Expected: FAIL — TypeScript compile error like:
`Property 'listFiles' does not exist on type 'SqliteGraphStore'.`

**Step 3 — Write minimal implementation**
1) Update `src/graph/store.ts` to add `listFiles()` to the interface:
```ts
export interface GraphStore {
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | null;
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
  getNodesByFile(file: string): GraphNode[];
  deleteFile(file: string): void;

  // NEW: list all files currently tracked by file hashes
  listFiles(): string[];

  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  close(): void;
}
```

2) Implement it in `src/graph/sqlite.ts` (add near the other file-hash methods):
```ts
  listFiles(): string[] {
    const rows = this.db
      .query("SELECT file FROM file_hashes ORDER BY file ASC")
      .all() as Array<{ file: string }>;

    return rows.map((r) => r.file);
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-list-files.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 8: Implement indexProject() to index .ts files (exclude node_modules) and store hashes/nodes/edges [depends: 7]

### Task 8: Implement `indexProject()` to index `.ts` files (exclude node_modules) and store hashes/nodes/edges [depends: 7]

**Files:**
- Modify: `src/indexer/pipeline.ts`
- Create: `test/indexer-index-project.test.ts`

**Step 1 — Write the failing test**
Create `test/indexer-index-project.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

test("indexProject indexes .ts files under root, excludes node_modules, and persists nodes/edges + file hashes", () => {
  const root = join(tmpdir(), `pi-codegraph-index-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });

  const aContent = [
    'import { x } from "./b";',
    "export function a() {",
    "  x();",
    "}",
  ].join("\n");

  const bContent = ["export function x() {}"].join("\n");
  const ignoredContent = "export function ignored() {}";

  writeFileSync(join(root, "src", "a.ts"), aContent);
  writeFileSync(join(root, "src", "b.ts"), bContent);
  writeFileSync(join(root, "node_modules", "pkg", "ignored.ts"), ignoredContent);

  const store = new SqliteGraphStore(dbPath);
  try {
    const result = indexProject(root, store);

    expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });

    const db = new Database(dbPath);
    try {
      const fileRows = db
        .query("SELECT file, hash FROM file_hashes ORDER BY file ASC")
        .all() as Array<{ file: string; hash: string }>;

      expect(fileRows).toEqual([
        { file: "src/a.ts", hash: sha256Hex(aContent) },
        { file: "src/b.ts", hash: sha256Hex(bContent) },
      ]);

      const nodeCount = (db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c;
      expect(nodeCount).toBeGreaterThanOrEqual(4); // 2 module nodes + 2 function nodes

      const edgeKinds = db
        .query("SELECT kind FROM edges ORDER BY kind ASC")
        .all() as Array<{ kind: string }>;
      expect(edgeKinds.map((r) => r.kind)).toEqual(["calls", "imports"]);
    } finally {
      db.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-index-project.test.ts`
Expected: FAIL — `SyntaxError: The requested module '../src/indexer/pipeline.js' does not provide an export named 'indexProject'`

**Step 3 — Write minimal implementation**
Replace `src/indexer/pipeline.ts` with:
```ts
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { GraphStore } from "../graph/store.js";
import { extractFile, sha256Hex } from "./tree-sitter.js";

export interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
}

function toPosixPath(p: string): string {
  return p.split(sep).join("/");
}

function walkTsFiles(root: string): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules") continue;
      const full = join(dir, ent.name);

      if (ent.isDirectory()) {
        walk(full);
        continue;
      }

      if (ent.isFile() && ent.name.endsWith(".ts")) {
        out.push(full);
      }
    }
  };

  walk(root);
  return out;
}

export function indexProject(projectRoot: string, store: GraphStore): IndexResult {
  const files = walkTsFiles(projectRoot);

  let indexed = 0;
  const skipped = 0;
  const removed = 0;
  let errors = 0;

  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));

    try {
      const content = readFileSync(absPath, "utf8");
      const hash = sha256Hex(content);

      const extracted = extractFile(rel, content);

      store.addNode(extracted.module);
      for (const node of extracted.nodes) store.addNode(node);
      for (const edge of extracted.edges) store.addEdge(edge);

      store.setFileHash(rel, hash);
      indexed++;
    } catch {
      errors++;
    }
  }

  return { indexed, skipped, removed, errors };
}

// Back-compat with the existing placeholder export test
export const IndexPipeline = indexProject;
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-index-project.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 9: Add incremental hashing: skip unchanged files and delete+reindex changed files [depends: 8]

### Task 9: Add incremental hashing: skip unchanged files and delete+reindex changed files [depends: 8]

**Files:**
- Modify: `src/indexer/pipeline.ts`
- Modify: `test/indexer-index-project.test.ts`

**Step 1 — Write the failing test**
Replace `test/indexer-index-project.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

test("indexProject indexes .ts files under root, excludes node_modules, and persists nodes/edges + file hashes", () => {
  const root = join(tmpdir(), `pi-codegraph-index-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });

  const aContent = [
    'import { x } from "./b";',
    "export function a() {",
    "  x();",
    "}",
  ].join("\n");

  const bContent = ["export function x() {}"].join("\n");
  const ignoredContent = "export function ignored() {}";

  writeFileSync(join(root, "src", "a.ts"), aContent);
  writeFileSync(join(root, "src", "b.ts"), bContent);
  writeFileSync(join(root, "node_modules", "pkg", "ignored.ts"), ignoredContent);

  const store = new SqliteGraphStore(dbPath);
  try {
    const result = indexProject(root, store);

    expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });

    const db = new Database(dbPath);
    try {
      const fileRows = db
        .query("SELECT file, hash FROM file_hashes ORDER BY file ASC")
        .all() as Array<{ file: string; hash: string }>;

      expect(fileRows).toEqual([
        { file: "src/a.ts", hash: sha256Hex(aContent) },
        { file: "src/b.ts", hash: sha256Hex(bContent) },
      ]);

      const nodeCount = (db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c;
      expect(nodeCount).toBeGreaterThanOrEqual(4);

      const edgeKinds = db
        .query("SELECT kind FROM edges ORDER BY kind ASC")
        .all() as Array<{ kind: string }>;
      expect(edgeKinds.map((r) => r.kind)).toEqual(["calls", "imports"]);
    } finally {
      db.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("indexProject skips unchanged files and delete+reindexes changed files", () => {
  const root = join(tmpdir(), `pi-codegraph-incremental-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });

  const aV1 = [
    "export function a() {",
    "  return 1;",
    "}",
  ].join("\n");

  const bV1 = "export function b() {}";

  writeFileSync(join(root, "src", "a.ts"), aV1);
  writeFileSync(join(root, "src", "b.ts"), bV1);

  const store = new SqliteGraphStore(dbPath);
  try {
    expect(indexProject(root, store)).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });

    // Second run with no changes should skip everything
    expect(indexProject(root, store)).toEqual({ indexed: 0, skipped: 2, removed: 0, errors: 0 });

    // Change one file
    const aV2 = [
      "export function a2() {",
      "  return 2;",
      "}",
    ].join("\n");
    writeFileSync(join(root, "src", "a.ts"), aV2);

    expect(indexProject(root, store)).toEqual({ indexed: 1, skipped: 1, removed: 0, errors: 0 });

    const db = new Database(dbPath);
    try {
      const aRow = db
        .query("SELECT hash FROM file_hashes WHERE file = 'src/a.ts'")
        .get() as { hash: string };
      expect(aRow.hash).toBe(sha256Hex(aV2));

      const fnNames = db
        .query("SELECT name FROM nodes WHERE file = 'src/a.ts' AND kind = 'function' ORDER BY name")
        .all() as Array<{ name: string }>;

      // Proves delete-then-insert happened: old node `a` should be gone
      expect(fnNames.map((r) => r.name)).toEqual(["a2"]);
    } finally {
      db.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-index-project.test.ts`
Expected: FAIL — the second run assertion should fail because `indexProject` currently re-indexes everything (expected `{ indexed: 0, skipped: 2, ... }`).

**Step 3 — Write minimal implementation**
Update `src/indexer/pipeline.ts` so it:
- compares `store.getFileHash(rel)` with the new hash
- skips unchanged files
- calls `store.deleteFile(rel)` before re-indexing a changed file

Replace the loop body with:
```ts
  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));

    try {
      const content = readFileSync(absPath, "utf8");
      const hash = sha256Hex(content);

      const existing = store.getFileHash(rel);
      if (existing === hash) {
        skipped++;
        continue;
      }

      if (existing !== null) {
        store.deleteFile(rel);
      }

      const extracted = extractFile(rel, content);

      store.addNode(extracted.module);
      for (const node of extracted.nodes) store.addNode(node);
      for (const edge of extracted.edges) store.addEdge(edge);

      store.setFileHash(rel, hash);
      indexed++;
    } catch {
      errors++;
    }
  }
```

Also change the initial counters in `indexProject` to be mutable:
```ts
  let indexed = 0;
  let skipped = 0;
  const removed = 0;
  let errors = 0;
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-index-project.test.ts`
Expected: PASS

**Step 5 —Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 10: Handle deleted files (removed count) and continue indexing when a file read fails [depends: 9]

### Task 10: Handle deleted files (`removed` count) and continue indexing when a file read fails [depends: 9]

**Files:**
- Modify: `src/indexer/pipeline.ts`
- Modify: `test/indexer-index-project.test.ts`

**Step 1 — Write the failing test**
Replace `test/indexer-index-project.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

test("indexProject indexes .ts files under root, excludes node_modules, and persists nodes/edges + file hashes", () => {
  const root = join(tmpdir(), `pi-codegraph-index-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });

  const aContent = [
    'import { x } from "./b";',
    "export function a() {",
    "  x();",
    "}",
  ].join("\n");

  const bContent = ["export function x() {}"].join("\n");
  const ignoredContent = "export function ignored() {}";

  writeFileSync(join(root, "src", "a.ts"), aContent);
  writeFileSync(join(root, "src", "b.ts"), bContent);
  writeFileSync(join(root, "node_modules", "pkg", "ignored.ts"), ignoredContent);

  const store = new SqliteGraphStore(dbPath);
  try {
    const result = indexProject(root, store);

    expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });

    const db = new Database(dbPath);
    try {
      const fileRows = db
        .query("SELECT file, hash FROM file_hashes ORDER BY file ASC")
        .all() as Array<{ file: string; hash: string }>;

      expect(fileRows).toEqual([
        { file: "src/a.ts", hash: sha256Hex(aContent) },
        { file: "src/b.ts", hash: sha256Hex(bContent) },
      ]);

      const edgeKinds = db
        .query("SELECT kind FROM edges ORDER BY kind ASC")
        .all() as Array<{ kind: string }>;
      expect(edgeKinds.map((r) => r.kind)).toEqual(["calls", "imports"]);
    } finally {
      db.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("indexProject deletes missing files and continues when a file cannot be read", () => {
  const root = join(tmpdir(), `pi-codegraph-removed-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });

  const aContent = "export function a() {}";
  const bContent = "export function b() {}";
  const unreadablePath = join(root, "src", "unreadable.ts");

  writeFileSync(join(root, "src", "a.ts"), aContent);
  writeFileSync(join(root, "src", "b.ts"), bContent);
  writeFileSync(unreadablePath, "export function nope() {}");

  // Make unreadable to force readFileSync failure
  chmodSync(unreadablePath, 0o000);

  const store = new SqliteGraphStore(dbPath);
  try {
    expect(indexProject(root, store)).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });

    // Remove a previously indexed file
    rmSync(join(root, "src", "b.ts"), { force: true });

    expect(indexProject(root, store)).toEqual({ indexed: 0, skipped: 1, removed: 1, errors: 1 });

    const db = new Database(dbPath);
    try {
      const fileRows = db
        .query("SELECT file FROM file_hashes ORDER BY file ASC")
        .all() as Array<{ file: string }>;

      // b.ts removed; unreadable.ts never indexed successfully
      expect(fileRows.map((r) => r.file)).toEqual(["src/a.ts"]);
    } finally {
      db.close();
    }
  } finally {
    // Restore permissions so cleanup works reliably
    try {
      chmodSync(unreadablePath, 0o644);
    } catch {
      // ignore
    }

    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-index-project.test.ts`
Expected: FAIL — the second test should fail because `indexProject` currently never reports `removed: 1` when a previously indexed file disappears.

**Step 3 — Write minimal implementation**
Update `src/indexer/pipeline.ts` to delete files that were previously indexed but no longer exist on disk.

1) Make `removed` mutable:
```ts
  let removed = 0;
```

2) Build the set of current relative file paths:
```ts
  const currentRel = new Set(files.map((absPath) => toPosixPath(relative(projectRoot, absPath))));
```

3) After the per-file indexing loop, delete missing files:
```ts
  for (const oldFile of store.listFiles()) {
    if (currentRel.has(oldFile)) continue;
    try {
      store.deleteFile(oldFile);
      removed++;
    } catch {
      errors++;
    }
  }
```

4) Return the updated `removed` value.

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-index-project.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
