---
id: 6
title: Extract signature for interface declarations
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/signature-extract-interface.test.ts
---

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
