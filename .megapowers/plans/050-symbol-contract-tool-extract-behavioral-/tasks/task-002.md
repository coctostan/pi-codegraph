---
id: 2
title: Contract extractor — guard pattern extraction
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/contract-extractor.ts
files_to_create:
  - test/contract-extractor-guards.test.ts
---

**Files:**
- Modify: `src/indexer/contract-extractor.ts`
- Create: `test/contract-extractor-guards.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/contract-extractor-guards.test.ts
import { expect, test } from "bun:test";
import { extractGuards } from "../src/indexer/contract-extractor.js";

test("extractGuards finds if (!x) return pattern", () => {
  const code = `function foo(x: string) {
  if (!x) return;
  return x.toUpperCase();
}`;
  const result = extractGuards(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("!x");
});

test("extractGuards finds if (x == null) return pattern", () => {
  const code = `function foo(x: string) {
  if (x == null) return;
  return x;
}`;
  const result = extractGuards(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("x == null");
});

test("extractGuards finds if (x === undefined) return pattern", () => {
  const code = `function foo(x: string) {
  if (x === undefined) return;
  return x;
}`;
  const result = extractGuards(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("x === undefined");
});

test("extractGuards returns empty array when no guards", () => {
  const code = `function foo() { return 1; }`;
  const result = extractGuards(code, 1, 1);
  expect(result).toHaveLength(0);
});

test("extractGuards finds multiple guards", () => {
  const code = `function foo(x: string, y: number) {
  if (!x) return;
  if (y <= 0) return;
  return x.repeat(y);
}`;
  const result = extractGuards(code, 1, 5);
  expect(result).toHaveLength(2);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/contract-extractor-guards.test.ts`
Expected: FAIL — `error: "extractGuards" is not exported from module`

**Step 3 — Write minimal implementation**

Add to `src/indexer/contract-extractor.ts`:

```typescript
export function extractGuards(fileContent: string, startLine: number, endLine: number): string[] {
  const bodyText = extractBodyLines(fileContent, startLine, endLine);
  const parser = getParser();
  const tree = parser.parse(bodyText);
  const guards: string[] = [];

  walk(tree.rootNode, (n) => {
    if (n.type !== "if_statement") return;

    const consequence = n.childForFieldName("consequence");
    if (!consequence) return;

    // Check if the body is a return statement (or block with just a return)
    let isGuard = false;
    if (consequence.type === "return_statement") {
      isGuard = true;
    } else if (consequence.type === "statement_block") {
      const stmts = consequence.namedChildren.filter((c) => c.type !== "comment");
      if (stmts.length === 1 && stmts[0]?.type === "return_statement") {
        isGuard = true;
      }
    }

    if (!isGuard) return;

    const condition = n.childForFieldName("condition");
    if (!condition) return;

    // Extract the condition text, stripping outer parens
    let condText = condition.text;
    if (condText.startsWith("(") && condText.endsWith(")")) {
      condText = condText.slice(1, -1);
    }
    guards.push(condText.length > 80 ? condText.slice(0, 77) + "..." : condText);
  });

  return guards;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/contract-extractor-guards.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
