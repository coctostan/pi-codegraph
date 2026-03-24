---
id: 7
title: symbolContract — fallback when no tests exist
status: approved
depends_on:
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-symbol-contract-no-tests.test.ts
---

**Files:**
- Create: `test/tool-symbol-contract-no-tests.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-no-tests.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract omits test-evidenced behaviors section when no tested_by edges exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-notests-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const srcContent = `export function greet(name: string): string {
  if (!name) throw new Error("name required");
  return "hello " + name;
}
`;
  writeFileSync(join(projectRoot, "src/greet.ts"), srcContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(srcContent);

    store.addNode({
      id: "src/greet.ts::greet:1", kind: "function", name: "greet",
      file: "src/greet.ts", start_line: 1, end_line: 4,
      content_hash: hash, is_exported: true,
      signature: "(name: string) => string",
    });

    const output = symbolContract({ name: "greet", store, projectRoot });

    // Should have signature sections
    expect(output).toContain("### Takes");
    expect(output).toContain("### Returns");

    // Should have throws
    expect(output).toContain("### Throws / Error paths");
    expect(output).toContain("name required");

    // Should NOT have test section
    expect(output).not.toContain("Test-evidenced behaviors");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-no-tests.test.ts`
Expected: PASS — already handled in Task 4's implementation.

**Step 3 — Write minimal implementation**
No additional implementation needed — already handled in Task 4.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-no-tests.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
