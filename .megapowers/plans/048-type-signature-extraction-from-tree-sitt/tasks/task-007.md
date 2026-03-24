---
id: 7
title: Extract type parameters in function signatures
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/signature-extract-generics.test.ts
---

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
