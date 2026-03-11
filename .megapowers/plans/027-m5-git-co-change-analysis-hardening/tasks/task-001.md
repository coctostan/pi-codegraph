---
id: 1
title: Aliased imports resolve to original exported name
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
  - test/indexer-extract-file.test.ts
files_to_create: []
---

**AC:** 9 (aliased imports), 19 (regression safety)

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `test/indexer-extract-file.test.ts`

**Step 1 — Write the failing test**

In `test/indexer-extract-file.test.ts`, update the existing aliased import test and add a new test for alias-to-call resolution:

```ts
// Replace the existing test at line ~125 with this updated version:
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

  // Aliased import: `import { foo as baz }` should create edge targeting original name `foo`, not `baz`
  const bazEdge = imports.find((e) => e.target.includes("::baz:"));
  expect(bazEdge).toBeUndefined(); // no edge to "baz"

  // There should be TWO edges to "foo" (one from named, one from alias)
  const fooEdges = imports.filter((e) => e.target.includes("::foo:"));
  expect(fooEdges.length).toBe(2);

  const defaultEdge = imports.find((e) => e.target.includes("::default:"));
  expect(defaultEdge).toBeDefined();
});

// Add new test for alias call resolution:
test("extractFile resolves aliased import calls to the original exported name", () => {
  const file = "src/alias-call.ts";
  const content = [
    'import { helper as h } from "./utils";',
    "function main() {",
    "  h();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);

  const callEdges = result.edges.filter((e) => e.kind === "calls");
  // h() should resolve to "helper", not "h"
  const helperCall = callEdges.find((e) => e.target.includes("::helper:"));
  expect(helperCall).toBeDefined();

  const hCall = callEdges.find((e) => e.target.includes("::h:"));
  expect(hCall).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // Expected: 2, Received: 1` (aliased import currently creates edge to "baz" not "foo", and there's only 1 foo edge) and the alias-call test fails because `h()` creates an edge to `__unresolved__::h:0` not `__unresolved__::helper:0`.

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, modify the `extractFile` function's import extraction and call extraction:

1. In the import_statement handler (around line 170), when iterating `namedImports`, check for an `alias` field on the import_specifier. If present, use the `name` field (original) for the edge target, and build a local alias map.
2. In the call visitor, look up bare identifiers in the alias map before creating the edge.

```ts
// Inside extractFile, before the walk() call, add:
const aliasToOriginal = new Map<string, string>();

// Inside the namedImports loop (around line 172), replace the current block with:
for (const spec of namedImports.namedChildren) {
  if (spec.type !== "import_specifier") continue;
  const nameNode = spec.childForFieldName("name");
  if (!nameNode) continue;
  const originalName = nameNode.text;

  const aliasNode = spec.childForFieldName("alias");
  if (aliasNode) {
    aliasToOriginal.set(aliasNode.text, originalName);
  }

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

// In the call visitor, where callee?.type === "identifier" (around line 238), replace:
//   target: unresolvedId(callee.text),
// with:
  target: unresolvedId(aliasToOriginal.get(callee.text) ?? callee.text),
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 168 tests passing
