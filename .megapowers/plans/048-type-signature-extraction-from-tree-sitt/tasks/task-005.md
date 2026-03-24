---
id: 5
title: Extract signature for class declarations
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/signature-extract-class.test.ts
---

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
