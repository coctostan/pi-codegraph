---
id: 8
title: symbolContract — fallback when no signature exists
status: approved
depends_on:
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-symbol-contract-no-signature.test.ts
---

**Files:**
- Create: `test/tool-symbol-contract-no-signature.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-no-signature.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract omits Takes and Returns when node has no signature", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-nosig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const srcContent = `export function doStuff() {
  if (!ready) return;
  throw new Error("not implemented");
}
`;
  writeFileSync(join(projectRoot, "src/stuff.ts"), srcContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(srcContent);

    // Node WITHOUT signature
    store.addNode({
      id: "src/stuff.ts::doStuff:1", kind: "function", name: "doStuff",
      file: "src/stuff.ts", start_line: 1, end_line: 4,
      content_hash: hash, is_exported: true,
    });

    const output = symbolContract({ name: "doStuff", store, projectRoot });

    // Should NOT have Takes/Returns
    expect(output).not.toContain("### Takes");
    expect(output).not.toContain("### Returns");

    // Should still have throws and guards
    expect(output).toContain("### Throws / Error paths");
    expect(output).toContain("not implemented");
    expect(output).toContain("### Guards / Preconditions");
    expect(output).toContain("!ready");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-no-signature.test.ts`
Expected: PASS — already handled in Task 4's implementation.

**Step 3 — Write minimal implementation**
No additional implementation needed — already handled in Task 4.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-no-signature.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
