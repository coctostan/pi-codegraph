---
id: 5
title: Extract named/aliased/default import statements as imports edges
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
  - test/indexer-extract-file.test.ts
files_to_create: []
---

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
