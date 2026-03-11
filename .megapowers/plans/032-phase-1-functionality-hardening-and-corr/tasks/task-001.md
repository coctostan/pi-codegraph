---
id: 1
title: Refresh stale persisted graph before serving tool results
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-stale-db-refresh.test.ts
---

### Task 1: Refresh stale persisted graph before serving tool results (covers AC 1 and AC 2 by re-running indexing before serving `symbol_graph` from a persisted stale DB)
**Files:**
- Create: `test/extension-stale-db-refresh.test.ts`
- Modify: `src/index.ts`
- Test: `test/extension-stale-db-refresh.test.ts`
**Step 1 — Write the failing test**
```ts
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
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-stale-db-refresh.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because the stale-db run still returns the old GraphStore anchor such as `src/graph/store.ts:30:` with a `[stale]` marker instead of the refreshed `src/graph/store.ts:33:` anchor.

**Step 3 — Write minimal implementation**
Replace `ensureIndexed()` in `src/index.ts` with the incremental-refresh version below. This fix relies on `indexProject()` already being incremental: unchanged files are skipped, while changed, removed, and newly added files are reconciled before any tool response is returned.
```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  await indexProject(projectRoot, store);
  }
```
**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-stale-db-refresh.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
