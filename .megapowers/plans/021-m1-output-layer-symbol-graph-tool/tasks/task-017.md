---
id: 17
title: symbolGraph truncates neighbor categories independently with limit
status: approved
depends_on:
  - 13
no_test: false
files_to_modify:
  - test/tool-symbol-graph.test.ts
files_to_create: []
---

**Spec criteria:** 26

**Files:**
- Test: `test/tool-symbol-graph.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-symbol-graph.test.ts`:

```typescript
test("symbolGraph truncates each neighbor category independently to limit", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const hashA = sha256Hex(fileAContent);

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });

    // Add 3 callees
    for (let i = 0; i < 3; i++) {
      const calleeId = `src/a.ts::callee${i}:${10 + i}`;
      store.addNode({ id: calleeId, kind: "function", name: `callee${i}`, file: "src/a.ts", start_line: 10 + i, end_line: 10 + i, content_hash: hashA });
      store.addEdge({
        source: "src/a.ts::foo:3",
        target: calleeId,
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5 - i * 0.1, evidence: "call", content_hash: hashA },
        created_at: Date.now(),
      });
    }

    // Limit to 2 — should see 2 callees and "(1 more omitted)"
    const output = symbolGraph({ name: "foo", limit: 2, store, projectRoot });

    expect(output).toContain("Callees");
    expect(output).toContain("callee0"); // highest confidence
    expect(output).toContain("callee1");
    expect(output).toContain("(1 more omitted)");
    expect(output).not.toContain("callee2"); // truncated

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS — Task 13 implementation already passes `limit` to `buildSection` for each category. This test covers spec criterion 26.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
