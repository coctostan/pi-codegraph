---
id: 9
title: "RC-E mutex: coalesce parallel ensureIndexed calls onto one in-flight promise"
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/ensure-indexed-mutex.test.ts
---

Add a module-level in-flight promise so parallel tool calls share a single
`indexProject` run instead of racing. Exposes a
test-hook `setIndexProjectForTesting(fn)` so the test can count
invocations and verify coalescing.

**Files:**
- Modify: `src/index.ts`
- Create: `test/ensure-indexed-mutex.test.ts`

**Step 1 — Write the failing test**

Create `test/ensure-indexed-mutex.test.ts`:

```ts
import { expect, test, describe, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createTestProject(): string {
  const root = join(tmpdir(), `pi-cg-mutex-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src/hello.ts"),
    "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
  );
  return root;
}

describe("RC-E: ensureIndexed coalesces parallel calls", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  test("N=4 parallel tool invocations run indexProject exactly once, and resetStoreForTesting restores the override + in-flight state", async () => {
    const root = createTestProject();
    dirs.push(root);

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();
    // Install a counting/stalling indexProject override before registering tools.
    let indexCallCount = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    mod.setIndexProjectForTesting(async () => {
      indexCallCount++;
      await gate;
      return { indexed: 0, skipped: 0, removed: 0, errors: 0, timings: {} };
    });

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    const prevDev = process.env.CODEGRAPH_DEVMODE;
    process.env.CODEGRAPH_DEVMODE = "1";
    try {
      mod.default(mockPi as any);
    } finally {
      if (prevDev === undefined) delete process.env.CODEGRAPH_DEVMODE;
      else process.env.CODEGRAPH_DEVMODE = prevDev;
    }

    try {
      const ctx = { cwd: root };
      const p1 = sgExecute!("c1", { name: "alpha" }, undefined, undefined, ctx);
      const p2 = sgExecute!("c2", { name: "alpha" }, undefined, undefined, ctx);
      const p3 = sgExecute!("c3", { name: "alpha" }, undefined, undefined, ctx);
      const p4 = sgExecute!("c4", { name: "alpha" }, undefined, undefined, ctx);
      // entered ensureIndexed and awaited the in-flight promise.
      await new Promise((r) => setTimeout(r, 20));
      release();
      const results = await Promise.all([p1, p2, p3, p4]);
      expect(results.length).toBe(4);
      for (const r of results) expect(r.content[0]?.text).toBeDefined();
      expect(indexCallCount).toBe(1);
      // resetStoreForTesting must clear BOTH new pieces of module-level
      // state introduced by this batch: `indexProjectImpl` (so later calls
      // do not keep hitting the stale override) and `indexingInFlight` (so
      // they do not await a resolved-but-not-cleared promise).
      mod.resetStoreForTesting();

      let secondCallCount = 0;
      mod.setIndexProjectForTesting(async () => {
        secondCallCount++;
        return { indexed: 0, skipped: 0, removed: 0, errors: 0, timings: {} };
      });

      await sgExecute!("after-reset", { name: "alpha" }, undefined, undefined, ctx);

      // The first override was cleared by resetStoreForTesting — if the
      // reset had forgotten to restore `indexProjectImpl`, indexCallCount
      // would have ticked up to 2 here instead.
      expect(indexCallCount).toBe(1);
      // The fresh override installed after the reset did run once, which
      // also proves `indexingInFlight` was cleared (otherwise the post-reset
      // call would have awaited a nulled-out promise or no-op'd).
      expect(secondCallCount).toBe(1);
    } finally {
      mod.setIndexProjectForTesting(null);
      mod.resetStoreForTesting();
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/ensure-indexed-mutex.test.ts`

Expected: FAIL — the runner prints:
```
TypeError: mod.setIndexProjectForTesting is not a function
    at .../test/ensure-indexed-mutex.test.ts
```
because the test hook does not exist yet.

**Step 3 — Write minimal implementation**

Edit `src/index.ts`:

1) Add module-level state next to `lastIndexError` (below `src/index.ts:64`):

```ts
let indexingInFlight: Promise<void> | null = null;
type IndexProjectFn = typeof indexProject;
let indexProjectImpl: IndexProjectFn = indexProject;
```

The alias `indexProjectImpl` lets tests swap the implementation. (We'll
import `indexProject` directly above and re-point through `indexProjectImpl`
in `ensureIndexed`.)

2) Add the test hook (alongside `getLastIndexErrorForTesting`,
`resetStoreForTesting`):

```ts
export function setIndexProjectForTesting(fn: IndexProjectFn | null): void {
  indexProjectImpl = fn ?? indexProject;
}
```

3) Extend `resetStoreForTesting` at `src/index.ts:74-80` to also clear the
in-flight promise:

```ts
export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
  lastIndexError = null;
  indexingInFlight = null;
  indexProjectImpl = indexProject;
  resetSession();
  _resetSearchCache();
}
```

4) Replace the body of `ensureIndexed` at `src/index.ts:101-113` with a
coalescing gate that uses `indexProjectImpl`:

```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (indexingInFlight) return indexingInFlight;
  indexingInFlight = (async () => {
    try {
      const result = await indexProjectImpl(projectRoot, store);
      if (result.errors > 0 && !dbIsWritable(projectRoot)) {
        lastIndexError = { error: new Error("readonly database"), setAt: Date.now() };
      } else {
        lastIndexError = null;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastIndexError = { error, setAt: Date.now() };
    } finally {
      indexingInFlight = null;
    }
  })();
  return indexingInFlight;
}
```

The `IndexErrorRecord` shape is from Task 8.

**Step 4 — Run test, verify it passes**

Run: `bun test test/ensure-indexed-mutex.test.ts`

Expected: PASS — `indexCallCount === 1` with four parallel callers; the
post-reset assertions confirm `indexCallCount` stays at 1 (first override
cleared by `resetStoreForTesting`) and the fresh override records
`secondCallCount === 1` (`indexingInFlight` was cleared, so the post-reset
tool call ran a new indexing pass).

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. `test/extension-stale-db-refresh.test.ts` and
`test/extension-auto-index.test.ts` continue to pass because
`indexProjectImpl` defaults to the real `indexProject`; the in-flight
promise clears in `finally`, so sequential calls re-run indexing as before.
