---
id: 1
title: Validate ensureIndexed() fix and regression test
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-stale-db-refresh.test.ts
files_to_create: []
---

### Task 1: Validate ensureIndexed() fix and regression test

The fix (commit `2b4c5693`) and its regression test are already committed on this branch. This task validates both are correct.

**Files:**
- Modify: `src/index.ts` (already fixed — validate only)
- Test: `test/extension-stale-db-refresh.test.ts` (already exists — validate only)

**Step 1 — Verify the failing test exists and covers the bug**

The test at `test/extension-stale-db-refresh.test.ts` already exists. Verify its content matches the reproduction:

```typescript
import { expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extension refreshes a persisted stale graph before symbol_graph responds", async () => {
  const fixtureRoot = join(tmpdir(), `pi-cg-stale-refresh-${Date.now()}`);
  mkdirSync(fixtureRoot, { recursive: true });
  cpSync(join(process.cwd(), "src"), join(fixtureRoot, "src"), { recursive: true });
  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    let symbolGraphExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") symbolGraphExecute = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const ctx = { cwd: fixtureRoot };
    await symbolGraphExecute!("initial-sg", { name: "GraphStore", file: "src/graph/store.ts" }, undefined, undefined, ctx);
    const storePath = join(fixtureRoot, "src/graph/store.ts");
    writeFileSync(storePath, `// shift 1\n// shift 2\n// shift 3\n${readFileSync(storePath, "utf8")}`);
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    mod.default(mockPi as any);
    const symbolGraphResult = await symbolGraphExecute!(
      "stale-sg",
      { name: "GraphStore", file: "src/graph/store.ts" },
      undefined,
      undefined,
      ctx,
    );
    const symbolGraphText = symbolGraphResult.content[0]?.text ?? "";
    expect(symbolGraphText).toContain("src/graph/store.ts:33:");
    expect(symbolGraphText).not.toContain("[stale]");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}, 30_000);
```

**Step 2 — Verify the test passes (fix already applied)**

Run: `bun test test/extension-stale-db-refresh.test.ts`
Expected: PASS — 1 pass, 0 fail

The test would FAIL with the old code (`if (store.listFiles().length === 0)` guard) because:
- `symbolGraphText` would contain `src/graph/store.ts:30:` (stale) instead of `src/graph/store.ts:33:` (refreshed)
- `symbolGraphText` would contain `[stale]`

**Step 3 — Verify the production fix is correct**

The fix in `src/index.ts` at lines 77-79 should be:

```typescript
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  await indexProject(projectRoot, store);
}
```

This removes the `store.listFiles().length === 0` guard and delegates to `indexProject()`, which already has correct incremental change detection via per-file SHA-256 hash comparison.

**Step 4 — Run the specific test**

Run: `bun test test/extension-stale-db-refresh.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: 198 pass, 0 fail
