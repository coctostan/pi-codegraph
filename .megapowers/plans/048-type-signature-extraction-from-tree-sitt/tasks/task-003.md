---
id: 3
title: Extract signature for function declarations
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/signature-extract-function.test.ts
---

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
