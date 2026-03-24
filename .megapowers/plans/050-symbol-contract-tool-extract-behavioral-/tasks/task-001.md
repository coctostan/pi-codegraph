---
id: 1
title: Contract extractor — throw statement extraction
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/indexer/contract-extractor.ts
  - test/contract-extractor-throws.test.ts
---

**Files:**
- Create: `src/indexer/contract-extractor.ts`
- Create: `test/contract-extractor-throws.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/contract-extractor-throws.test.ts
import { expect, test } from "bun:test";
import { extractThrows } from "../src/indexer/contract-extractor.js";

test("extractThrows finds throw new Error with string literal", () => {
  const code = `function foo() {
  if (!x) throw new Error("missing x");
  return x;
}`;
  const result = extractThrows(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("missing x");
});

test("extractThrows finds throw new CustomError", () => {
  const code = `function foo() {
  throw new ValidationError("bad input");
}`;
  const result = extractThrows(code, 1, 3);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("ValidationError");
});

test("extractThrows finds plain throw expression", () => {
  const code = `function foo() {
  throw "something went wrong";
}`;
  const result = extractThrows(code, 1, 3);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("something went wrong");
});

test("extractThrows returns empty array when no throws", () => {
  const code = `function foo() { return 1; }`;
  const result = extractThrows(code, 1, 1);
  expect(result).toHaveLength(0);
});

test("extractThrows finds multiple throws", () => {
  const code = `function foo(x: string) {
  if (!x) throw new Error("missing x");
  if (x === "") throw new Error("empty x");
  return x;
}`;
  const result = extractThrows(code, 1, 5);
  expect(result).toHaveLength(2);
  expect(result[0]).toContain("missing x");
  expect(result[1]).toContain("empty x");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/contract-extractor-throws.test.ts`
Expected: FAIL — `error: Cannot find module "../src/indexer/contract-extractor.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/indexer/contract-extractor.ts
import Parser from "tree-sitter";
import ts from "tree-sitter-typescript";

type SyntaxNode = Parser.SyntaxNode;

function getParser(file: string = "input.ts"): Parser {
  const parser = new Parser();
  const mod = ts as unknown as { typescript: unknown; tsx: unknown };
  const lang = file.endsWith(".tsx") ? mod.tsx : mod.typescript;
  parser.setLanguage(lang as never);
  return parser;
}

function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
  visit(node);
  for (const child of node.namedChildren) walk(child, visit);
}

function extractBodyLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split(/\r?\n/);
  // startLine and endLine are 1-indexed
  return lines.slice(startLine - 1, endLine).join("\n");
}

export function extractThrows(fileContent: string, startLine: number, endLine: number): string[] {
  const bodyText = extractBodyLines(fileContent, startLine, endLine);
  const parser = getParser();
  const tree = parser.parse(bodyText);
  const throws: string[] = [];

  walk(tree.rootNode, (n) => {
    if (n.type !== "throw_statement") return;

    const expr = n.namedChildren[0];
    if (!expr) {
      throws.push("throw");
      return;
    }

    // throw new Error("msg") or throw new SomeError(...)
    if (expr.type === "new_expression") {
      const ctor = expr.childForFieldName("constructor");
      const args = expr.childForFieldName("arguments");
      const ctorName = ctor?.text ?? "Error";

      // If it's Error with a string argument, extract the message
      if (ctorName === "Error" && args) {
        const firstArg = args.namedChildren[0];
        if (firstArg?.type === "string" || firstArg?.type === "template_string") {
          const msg = firstArg.text.replace(/^['"`]|['"`]$/g, "");
          throws.push(msg);
          return;
        }
      }

      // Otherwise show the class name
      throws.push(ctorName);
      return;
    }

    // Plain throw expression
    const text = expr.text;
    throws.push(text.length > 80 ? text.slice(0, 77) + "..." : text);
  });

  return throws;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/contract-extractor-throws.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
