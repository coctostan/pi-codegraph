---
id: 15
title: symbolGraph returns disambiguation list for ambiguous names
status: approved
depends_on:
  - 13
no_test: false
files_to_modify:
  - test/tool-symbol-graph.test.ts
files_to_create: []
---

**Spec criteria:** 23

**Files:**
- Test: `test/tool-symbol-graph.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-symbol-graph.test.ts`:

```typescript
test("symbolGraph returns disambiguation list when multiple nodes match", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    // Two nodes with same name "foo" in different files
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    const output = symbolGraph({ name: "foo", store, projectRoot });

    // Should be a disambiguation list, not a neighborhood
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
    expect(output).toContain("function");
    expect(output).toContain("class");

    // Should NOT contain section headers (not a neighborhood)
    expect(output).not.toContain("Callers");
    expect(output).not.toContain("Callees");

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS — Task 13 implementation already handles multiple matches. This test covers spec criterion 23.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
