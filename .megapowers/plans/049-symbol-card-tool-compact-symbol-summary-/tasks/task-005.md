---
id: 5
title: symbolCard omits Covering Tests section when no tested_by edges exist
status: approved
depends_on:
  - 3
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-symbol-card-no-tests.test.ts
---

**Files:**
- Test: `test/tool-symbol-card-no-tests.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-no-tests.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard omits Covering Tests section when symbol has no tested_by edges", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-notests-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(fileContent);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hash });

    const output = symbolCard({ name: "foo", store, projectRoot });

    // Card renders but no Covering Tests section
    expect(output).toContain("## foo (function)");
    expect(output).not.toContain("Covering Tests");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-no-tests.test.ts`
Expected: PASS (Task 3 implementation only adds Covering Tests when `tests.length > 0`)

Note: This is a verification test for AC 8's edge case. Should pass immediately.

**Step 3 — No additional implementation needed**

Already handled in Task 3 via the `if (tests.length > 0)` guard.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-no-tests.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
