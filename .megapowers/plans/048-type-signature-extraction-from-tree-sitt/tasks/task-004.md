---
id: 4
title: Extract signature for arrow functions
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/signature-extract-arrow.test.ts
---

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
