---
id: 3
title: Re-export extraction from source modules
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/indexer-reexports.test.ts
---

**AC:** 11 (re-exports), 12 (barrel file awareness)

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/indexer-reexports.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-reexports.test.ts`:

```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile extracts re-export with original name", () => {
  const file = "src/index.ts";
  const content = 'export { foo } from "./bar";';
  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const importEdges = result.edges.filter((e) => e.kind === "imports");
  const fooEdge = importEdges.find((e) => e.target.includes("::foo:"));
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
});

test("extractFile extracts re-export with alias using original name", () => {
  const file = "src/index.ts";
  const content = 'export { foo as baz } from "./bar";';
  const result = extractFile(file, content);

  const importEdges = result.edges.filter((e) => e.kind === "imports");

  // Edge should target original name "foo", not alias "baz"
  const fooEdge = importEdges.find((e) => e.target.includes("::foo:"));
  expect(fooEdge).toBeDefined();

  const bazEdge = importEdges.find((e) => e.target.includes("::baz:"));
  expect(bazEdge).toBeUndefined();
});

test("extractFile extracts multiple re-exports from barrel file", () => {
  const file = "src/index.ts";
  const content = [
    'export { alpha, beta } from "./math";',
    'export { gamma } from "./science";',
  ].join("\n");
  const result = extractFile(file, content);

  const importEdges = result.edges.filter((e) => e.kind === "imports");
  expect(importEdges.find((e) => e.target.includes("::alpha:"))).toBeDefined();
  expect(importEdges.find((e) => e.target.includes("::beta:"))).toBeDefined();
  expect(importEdges.find((e) => e.target.includes("::gamma:"))).toBeDefined();
  expect(importEdges).toHaveLength(3);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-reexports.test.ts`
Expected: FAIL — `expect(received).toBeDefined() // Received: undefined` for the re-export import edges, since `export { ... } from "..."` is not currently handled.

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, inside the `walk` callback in `extractFile`, add a handler for `export_statement` nodes that have a `source` field (re-exports):

```ts
// After the import_statement handler (after line 194), add:
if (n.type === "export_statement") {
  const sourceNode = n.childForFieldName("source");
  if (!sourceNode) return; // Not a re-export (e.g., `export { foo }` without `from`)

  const evidence = sourceNode.text;

  // Handle `export { name1, name2 as alias } from "./source"`
  for (const child of n.namedChildren) {
    if (child.type === "export_clause") {
      for (const spec of child.namedChildren) {
        if (spec.type !== "export_specifier") continue;
        const nameNode = spec.childForFieldName("name");
        if (!nameNode) continue;
        const originalName = nameNode.text;

        pushEdge({
          source: moduleNode.id,
          target: unresolvedId(originalName),
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
  }
  return;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-reexports.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
