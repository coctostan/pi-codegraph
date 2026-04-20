---
id: 1
title: "RC-C: indexingFailedNote surfaces lastIndexError.message verbatim"
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/index.ts
  - test/ensure-indexed-error-message.test.ts
files_to_create: []
---

Fix `indexingFailedNote` to print the captured error message instead of the
hardcoded `"readonly database"` literal. Drive the change from a failing test
that forces a non-readonly error into `ensureIndexed`'s catch block via a
throw path that remains unguarded across the whole batch (`store.listFiles()`
is called outside any per-item guard in `src/indexer/pipeline.ts:96` and
`src/indexer/lsp.ts:46`, so Tasks 2–5 do not remove this regression).
**Files:**
- Modify: `src/index.ts`
- Modify: `test/ensure-indexed-error-message.test.ts` (replace the
  addEdge/definition monkey-patch with a `listFiles` throw so the regression
  stays red across Tasks 2–5)

**Step 1 — Rewrite the failing test**

Replace the entire contents of `test/ensure-indexed-error-message.test.ts`
with:

```ts
// Failing test for batch issue 072-harden-ensureindexed-error-path-real-mes.
// Demonstrates that when ensureIndexed catches a NON-readonly error (e.g. a
// pipeline stage throwing from store.listFiles), `indexingFailedNote()`
// still returns the hardcoded "readonly database" string instead of the real
// error message.
//
// Expected after fix: the tool output contains
//   "indexing-failed: tsserver crashed"
// (or similar) — never "readonly database" for a writable DB.

import { expect, test, describe, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

function createTestProject(): string {
  const projectRoot = join(tmpdir(), `pi-cg-err-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src/hello.ts"),
    "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
  );
  return projectRoot;
}

describe("batch 072: indexingFailedNote surfaces the real error message", () => {
  const testDirs: string[] = [];
  afterEach(() => {
    for (const dir of testDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    testDirs.length = 0;
  });

  test("non-readonly indexing failure is reported verbatim in tool output", async () => {
    const projectRoot = createTestProject();
    testDirs.push(projectRoot);

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    const previousDev = process.env.CODEGRAPH_DEVMODE;
    process.env.CODEGRAPH_DEVMODE = "1";
    try {
      mod.default(mockPi as any);
    } finally {
      if (previousDev === undefined) delete process.env.CODEGRAPH_DEVMODE;
      else process.env.CODEGRAPH_DEVMODE = previousDev;
    }

    // Force a non-readonly error inside the indexing pipeline. `listFiles()`
    // is called from `src/indexer/pipeline.ts:96` and `src/indexer/lsp.ts:46`
    // outside any per-item try/catch, so the throw propagates up through
    // `indexProject` into `ensureIndexed`'s catch block, setting
    // `lastIndexError` to our synthetic crash. This path stays unguarded
    // across Tasks 2–5.
    const originalListFiles = SqliteGraphStore.prototype.listFiles;
    SqliteGraphStore.prototype.listFiles = function () {
      throw new Error("tsserver crashed");
    };

    try {
      const ctx = { cwd: projectRoot };
      const sgResult = await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
      const sgText: string = sgResult.content[0]?.text ?? "";

      // The DB is perfectly writable — the bug is that the note hardcodes
      // "readonly database" regardless of the real cause. These assertions
      // force two things:
      //  1) the rendered text must contain the real captured message
      //     ("tsserver crashed"), proving RC-C is fixed at this call site;
      //  2) the rendered text must never manufacture "readonly database"
      //     from a non-readonly failure.
      //
      // We use a first-call assertion on purpose: Task 7's clear-on-healthy
      // reset is reverted to post-prefix (the clear affects the NEXT call),
      // so the note is still present on this first call where we can assert
      // its contents directly.
      expect(sgText).toContain("tsserver crashed");
      expect(sgText).not.toContain("readonly database");
      expect(sgText).toContain("alpha");
    } finally {
      SqliteGraphStore.prototype.listFiles = originalListFiles;
      mod.resetStoreForTesting();
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/ensure-indexed-error-message.test.ts`
Expected: FAIL — the runner prints
```
error: expect(received).toContain(expected)

Expected to contain: "tsserver crashed"
Received: "indexing-failed: graph may be stale (readonly database)\n## alpha (function)\nsrc/hello.ts:1:708c\n..."
```
(The `not.toContain("readonly database")` assertion is also violated on the same output; whichever `expect` fires first is what Bun prints. The point is that the baseline output contains the hardcoded lie and never contains the real captured message.)

**Step 3 — Write minimal implementation**
Change `indexingFailedNote` at `src/index.ts:115-118` from the hardcoded
literal to the captured message. Leave everything else in that file alone —
`ensureIndexed` already assigns `new Error("readonly database")` at
`src/index.ts:105` for the verified-readonly path, so printing
`lastIndexError.message` verbatim keeps the readonly case identical and fixes
all other cases.
Before (`src/index.ts:115-118`):

```ts
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return "indexing-failed: graph may be stale (readonly database)\n";
}
```

After:

```ts
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return `indexing-failed: ${lastIndexError.message}\n`;
}
```
No other edits in this task. The `lastIndexError` variable and its
assignments remain unchanged.
**Step 4 — Run test, verify it passes**

Run: `bun test test/ensure-indexed-error-message.test.ts`

Expected: PASS — output contains `indexing-failed: tsserver crashed` and does not contain `readonly database`.

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing. In particular, the existing
`test/readonly-graceful-degradation.test.ts` "tool output trust header
indicates indexing-failed when DB is readonly" test must remain green —
it asserts `toContain("indexing-failed")` only, and the rendered string for a
real readonly DB becomes `indexing-failed: readonly database\n` (the literal
is set at `src/index.ts:105`), which satisfies the assertion.
