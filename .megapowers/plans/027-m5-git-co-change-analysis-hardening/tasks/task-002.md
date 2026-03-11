---
id: 2
title: Namespace imports with qualified call resolution
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/indexer-namespace-imports.test.ts
---

**AC:** 10 (namespace imports)

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/indexer-namespace-imports.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-namespace-imports.test.ts`:

```ts
import { expect, test } from "bun:test";
import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile extracts namespace import and resolves qualified calls", () => {
  const file = "src/app.ts";
  const content = [
    'import * as utils from "./utils";',
    "function main() {",
    "  utils.helper();",
    "  utils.format();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);

  // Should have an import edge for the namespace
  const importEdges = result.edges.filter((e) => e.kind === "imports");
  const nsImport = importEdges.find((e) => e.target.includes("::*:"));
  expect(nsImport).toBeDefined();
  expect(nsImport!.provenance.evidence).toContain("./utils");

  // utils.helper() should create a calls edge to __unresolved__::helper:0
  const callEdges = result.edges.filter((e) => e.kind === "calls");
  const helperCall = callEdges.find((e) => e.target.includes("::helper:"));
  expect(helperCall).toBeDefined();
  expect(helperCall!.source).toBe(nodeId(file, "main", 2));

  // utils.format() should create a calls edge to __unresolved__::format:0
  const formatCall = callEdges.find((e) => e.target.includes("::format:"));
  expect(formatCall).toBeDefined();
});

test("extractFile does not treat non-namespace member calls as qualified calls", () => {
  const file = "src/plain.ts";
  const content = [
    "function run() {",
    "  obj.method();",
    "  this.foo();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);

  const callEdges = result.edges.filter((e) => e.kind === "calls");
  // obj and this are not namespace imports, so no calls edges
  expect(callEdges.find((e) => e.target.includes("::method:"))).toBeUndefined();
  expect(callEdges.find((e) => e.target.includes("::foo:"))).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-namespace-imports.test.ts`
Expected: FAIL — `expect(received).toBeDefined() // Received: undefined` for the namespace import edge and the qualified call edges, since neither namespace imports nor member-access calls are currently extracted.

**Step 3 — Write minimal implementation**

In `src/indexer/tree-sitter.ts`, inside `extractFile`:

1. Add a `namespaceImports` set alongside the existing `aliasToOriginal` map.
2. In the `import_statement` handler, detect `namespace_import` nodes (`import * as ns`), create an import edge, and record `ns` in the set.
3. In the call visitor, detect `member_expression` callees where the object is a known namespace identifier.

```ts
// After aliasToOriginal declaration, add:
const namespaceImports = new Set<string>();

// In the import_statement handler, after the hasDefault block and before the namedImports block, add:
const nsImport = importClause.namedChildren.find((c) => c.type === "namespace_import");
if (nsImport) {
  const nsNameNode = nsImport.namedChildren.find((c) => c.type === "identifier");
  if (nsNameNode) {
    namespaceImports.add(nsNameNode.text);
    pushEdge({
      source: moduleNode.id,
      target: unresolvedId("*"),
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

// In the call visitor, after the existing `callee?.type === "identifier"` block (around line 251), add:
if (callee?.type === "member_expression") {
  const obj = callee.childForFieldName("object");
  const prop = callee.childForFieldName("property");
  if (obj?.type === "identifier" && prop?.type === "property_identifier" && namespaceImports.has(obj.text)) {
    pushEdge({
      source: nextFunctionId,
      target: unresolvedId(prop.text),
      kind: "calls",
      provenance: {
        source: "tree-sitter",
        confidence: 0.5,
        evidence: callEvidence(prop),
        content_hash: contentHash,
      },
      created_at: Date.now(),
    });
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-namespace-imports.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing (168 existing + 2 new)
