## Task 1: Refresh stale persisted graph before serving tool results

The implementation in Step 3 is now correct, but the task still fails the plan granularity rule: Step 1 tests **two observable tool behaviors** (`symbol_graph` and `trace`) in one regression, even though the workflow requires one task to be one test + one implementation.

Revise this task so it has **one representative regression** for the shared `ensureIndexed()` behavior. The simplest fix is to keep `symbol_graph` and remove the `trace` half from the task.

### Step 1 changes
Replace the test body so it only captures and asserts `symbol_graph` output.

Use this shape:

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

### Step 2 changes
Because the task should now exercise only `symbol_graph`, make the expected failure specific to that assertion:

```text
Run: bun test test/extension-stale-db-refresh.test.ts
Expected: FAIL — expect(received).toContain(expected) because the stale-db run still returns the old GraphStore anchor such as src/graph/store.ts:30: with a [stale] marker instead of the refreshed src/graph/store.ts:33: anchor.
```

### Step 3 changes
Keep the current `ensureIndexed()` implementation exactly as planned:

```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  await indexProject(projectRoot, store);
}
```

### Task text / coverage line
Update the task heading/coverage sentence so it no longer claims one task verifies both tools. It should say this task covers AC 1 and AC 2 by re-running indexing before serving `symbol_graph` from a persisted stale DB.

If you want a separate regression for `trace`, add it as a separate task; do not keep both tool behaviors inside this one task.
