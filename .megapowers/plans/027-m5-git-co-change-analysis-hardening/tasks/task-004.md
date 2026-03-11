---
id: 4
title: Dynamic import extraction with low confidence
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/indexer-dynamic-imports.test.ts
---

**AC:** 13 (dynamic imports)

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/indexer-dynamic-imports.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-dynamic-imports.test.ts`:

```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile extracts dynamic import as low-confidence import edge", () => {
  const file = "src/lazy.ts";
  const content = [
    "async function loadModule() {",
    '  const mod = await import("./heavy");',
    "}",
  ].join("\n");
  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const importEdges = result.edges.filter((e) => e.kind === "imports");
  // Dynamic import creates a module-level import edge
  const dynamicEdge = importEdges.find((e) => e.provenance.confidence === 0.3);
  expect(dynamicEdge).toBeDefined();
  expect(dynamicEdge).toMatchObject({
    source: nodeId(file, file, 1),
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.3,
      evidence: expect.stringContaining("./heavy"),
      content_hash: expectedHash,
    },
  });
});

test("extractFile ignores dynamic import with non-string-literal argument", () => {
  const file = "src/computed.ts";
  const content = [
    "async function loadDynamic(name: string) {",
    "  const mod = await import(name);",
    "}",
  ].join("\n");
  const result = extractFile(file, content);

  const importEdges = result.edges.filter((e) => e.kind === "imports" && e.provenance.confidence === 0.3);
  expect(importEdges).toHaveLength(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-dynamic-imports.test.ts`
Expected: FAIL — `expect(received).toBeDefined() // Received: undefined` for the dynamic import edge, since `import("./heavy")` expressions are not currently extracted.

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, inside the `walk` callback in `extractFile`, add a handler for `call_expression` nodes where the function is `import` (dynamic imports). This should go in the main `walk` visitor (not the `visitCalls`), since dynamic imports are module-level edges:

```ts
// In the walk callback, add before the import_statement handler or after the variable_declarator handler:
if (n.type === "call_expression") {
  const fn = n.childForFieldName("function");
  if (fn?.type === "import") {
    const args = n.childForFieldName("arguments");
    if (args && args.namedChildren.length > 0) {
      const firstArg = args.namedChildren[0];
      if (firstArg?.type === "string" || firstArg?.type === "template_string") {
        const specifier = firstArg.text.replace(/^['"`]|['"`]$/g, "");
        pushEdge({
          source: moduleNode.id,
          target: unresolvedId(specifier),
          kind: "imports",
          provenance: {
            source: "tree-sitter",
            confidence: 0.3,
            evidence: specifier,
            content_hash: contentHash,
          },
          created_at: Date.now(),
        });
      }
    }
  }
}
```

Note: The tree-sitter TypeScript grammar represents `import("./mod")` as a `call_expression` with `function` of type `import`. The arguments are in an `arguments` node. We only extract when the first argument is a string literal.

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-dynamic-imports.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
