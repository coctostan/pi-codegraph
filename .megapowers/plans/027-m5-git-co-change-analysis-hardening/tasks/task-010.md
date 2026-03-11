---
id: 10
title: Git co-change graceful handling of non-git directories
status: approved
depends_on:
  - 8
no_test: false
files_to_modify: []
files_to_create:
  - test/indexer-git-no-repo.test.ts
---

**AC:** 8 (non-git repo graceful handling)

**Files:**
- Test: `test/indexer-git-no-repo.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-git-no-repo.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("runGitCoChangeStage completes without error in a non-git directory", async () => {
  const root = join(tmpdir(), `pi-codegraph-no-git-${Date.now()}`);
  mkdirSync(root, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    // Should not throw
    await runGitCoChangeStage(store, root);

    // Should create no edges
    const edges = store.queryRows<{ source: string }>(
      "SELECT source FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(edges).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runGitCoChangeStage completes without error in a git repo with no commits", async () => {
  const root = join(tmpdir(), `pi-codegraph-empty-git-${Date.now()}`);
  mkdirSync(root, { recursive: true });

  const { execSync } = await import("node:child_process");
  execSync("git init", { cwd: root, stdio: "ignore" });

  const store = new SqliteGraphStore();
  try {
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    await runGitCoChangeStage(store, root);

    const edges = store.queryRows<{ source: string }>(
      "SELECT source FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(edges).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-git-no-repo.test.ts`
Expected: FAIL — This should actually pass with the Task 9 implementation (since `getCurrentHead` returns null for non-git dirs and exits early). If it does pass, this test is still valuable as a regression guard. If the implementation from Task 8 doesn't handle this yet (before Task 9's incremental changes), it may fail with a thrown error from `execSync`.

Note: This test may pass immediately after Task 9 is implemented. The test's value is as a permanent regression guard for AC 8. If it passes at Step 2, skip to Step 5.

**Step 3 — Write minimal implementation**

The implementation should already be covered by Task 8/9's `parseGitLog` and `getCurrentHead` which catch errors from git CLI. Verify that:

1. `getCurrentHead` returns `null` when `git rev-parse HEAD` fails (non-git dir).
2. `parseGitLog` returns `[]` when `git log` fails.
3. `runGitCoChangeStage` returns early on either of those.

If any of these aren't handled, add the appropriate try/catch.

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-git-no-repo.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
