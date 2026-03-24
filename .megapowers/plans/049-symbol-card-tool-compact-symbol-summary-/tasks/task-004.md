---
id: 4
title: symbolCard shows "not available" when signature is null
status: approved
depends_on:
  - 3
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-symbol-card-no-signature.test.ts
---

**Files:**
- Test: `test/tool-symbol-card-no-signature.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-no-signature.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard shows 'not available' when node has no signature", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nosig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(fileContent);

    // Node WITHOUT signature field
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hash });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Signature");
    expect(output).toContain("not available");
    // Should NOT contain "undefined" or "null" as strings
    expect(output).not.toContain("undefined");
    expect(output).not.toContain("null");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-no-signature.test.ts`
Expected: PASS (already handled in Task 3 via `node.signature ?? "not available"`)

Note: This test validates the fallback behavior is correct. It should pass immediately given the Task 3 implementation. If it does pass, that's fine — this is a verification test for AC 7.

**Step 3 — No additional implementation needed**

The `node.signature ?? "not available"` from Task 3 handles this case.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-no-signature.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
