---
id: 9
title: symbolContract — fallback when source file is unreadable
status: approved
depends_on:
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-symbol-contract-no-body.test.ts
---

**Files:**
- Create: `test/tool-symbol-contract-no-body.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-no-body.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";

test("symbolContract omits throws/guards when source file does not exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-nobody-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  // Note: NOT writing the source file — it doesn't exist on disk

  try {
    const store = new SqliteGraphStore();

    store.addNode({
      id: "src/missing.ts::doStuff:1", kind: "function", name: "doStuff",
      file: "src/missing.ts", start_line: 1, end_line: 5,
      content_hash: "abc123", is_exported: true,
      signature: "(x: number) => string",
    });

    const output = symbolContract({ name: "doStuff", store, projectRoot });

    // Should still have signature sections
    expect(output).toContain("### Takes");
    expect(output).toContain("x: number");
    expect(output).toContain("### Returns");
    expect(output).toContain("string");

    // Should NOT have throws or guards (file missing)
    expect(output).not.toContain("### Throws");
    expect(output).not.toContain("### Guards");

    // Trust header present
    expect(output).toContain("## Trust");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-no-body.test.ts`
Expected: PASS — already handled in Task 4's implementation.

**Step 3 — Write minimal implementation**
No additional implementation needed — already handled in Task 4.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-no-body.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
