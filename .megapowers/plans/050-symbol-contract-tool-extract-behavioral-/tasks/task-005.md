---
id: 5
title: symbolContract — not-found returns error with trust header
status: approved
depends_on:
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-symbol-contract-not-found.test.ts
---

**Files:**
- Create: `test/tool-symbol-contract-not-found.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-not-found.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";

test("symbolContract returns not-found message with trust header for unknown symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-nf-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function foo() {}\n");

  try {
    const store = new SqliteGraphStore();
    const output = symbolContract({ name: "doesNotExist", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("not found");
    expect(output).toContain("doesNotExist");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-not-found.test.ts`
Expected: PASS — this should already pass from Task 4's implementation. (Included for AC coverage verification.)

**Step 3 — Write minimal implementation**
No additional implementation needed — already handled in Task 4.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-not-found.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
