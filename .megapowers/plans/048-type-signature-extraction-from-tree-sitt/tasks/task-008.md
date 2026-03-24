---
id: 8
title: Module nodes have no signature
status: approved
depends_on:
  - 3
no_test: false
files_to_modify: []
files_to_create:
  - test/signature-extract-module.test.ts
---

### Task 8: Module nodes have no signature [depends: 3]

**Files:**
- Test: `test/signature-extract-module.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/signature-extract-module.test.ts
import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("module node has no signature (undefined, not empty string)", () => {
  const result = extractFile("src/a.ts", "const x = 1;");
  expect(result.module.signature).toBeUndefined();
  expect("signature" in result.module).toBe(false);
});

test("function node without any type annotations still gets a param-only signature", () => {
  const result = extractFile("src/a.ts", "function foo() {}");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("()");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-extract-module.test.ts`
Expected: FAIL if module node somehow has a signature. If the implementation from Task 3 already leaves `module` without a signature, this may pass immediately — the test still adds regression value for AC 12.

**Step 3 — Write minimal implementation**

No production code needed — the module node is created directly (not through the extraction handlers), so it naturally lacks a signature. This test verifies the invariant.

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-extract-module.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
