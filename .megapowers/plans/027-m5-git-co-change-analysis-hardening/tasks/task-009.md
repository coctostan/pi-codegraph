---
id: 9
title: Git co-change incremental skip when HEAD unchanged
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - src/indexer/git.ts
files_to_create:
  - test/indexer-git-incremental.test.ts
---

**AC:** 7 (incremental co-change indexing)

**Files:**
- Modify: `src/indexer/git.ts`
- Test: `test/indexer-git-incremental.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-git-incremental.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";

function setupRepo(): string {
  const root = join(tmpdir(), `pi-codegraph-git-incr-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  execSync("git init", { cwd: root, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 1;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c1"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 2;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 2;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c2"', { cwd: root, stdio: "ignore" });

  return root;
}

function seedStore(store: SqliteGraphStore): void {
  store.addNode({ id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1" });
  store.addNode({ id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2" });
  store.setFileHash("src/a.ts", "h1");
  store.setFileHash("src/b.ts", "h2");
}

test("runGitCoChangeStage skips re-analysis when HEAD has not changed", async () => {
  const root = setupRepo();
  const store = new SqliteGraphStore();
  try {
    seedStore(store);
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    // First run: should create edges
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges1 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges1.length).toBeGreaterThan(0);

    // Delete the edges manually to detect if re-analysis happens
    store.queryRows("SELECT 1"); // no-op
    for (const e of store.queryRows<{ source: string; target: string; kind: string; provenance_source: string }>(
      "SELECT source, target, kind, provenance_source FROM edges WHERE kind = 'co_changes_with'"
    )) {
      store.deleteEdge(e.source, e.target, e.kind, e.provenance_source);
    }

    // Second run with same HEAD: should skip (edges stay deleted)
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges2 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges2.length).toBe(0); // Skipped — didn't re-create

  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runGitCoChangeStage clears and rebuilds when HEAD changes", async () => {
  const root = setupRepo();
  const store = new SqliteGraphStore();
  try {
    seedStore(store);
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges1 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges1.length).toBeGreaterThan(0);

    // Make a new commit to change HEAD
    writeFileSync(join(root, "src", "a.ts"), "export const a = 3;");
    writeFileSync(join(root, "src", "b.ts"), "export const b = 3;");
    execSync("git add .", { cwd: root, stdio: "ignore" });
    execSync('git commit -m "c3"', { cwd: root, stdio: "ignore" });

    // Run again — should clear old edges and rebuild
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges2 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges2.length).toBeGreaterThan(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-git-incremental.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // Expected: 0, Received: [positive number]` because the current implementation re-analyzes every time (no incrementalism).

**Step 3 — Write minimal implementation**

In `src/indexer/git.ts`, add HEAD tracking using the store's `setFileHash`/`getFileHash` with a special sentinel key:

```ts
const GIT_HEAD_KEY = "__git_cochange_head__";

function getCurrentHead(projectRoot: string): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: projectRoot, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// Update runGitCoChangeStage to check HEAD before analysis:
export async function runGitCoChangeStage(
  store: GraphStore,
  projectRoot: string,
  options: GitCoChangeOptions = {},
): Promise<void> {
  const head = getCurrentHead(projectRoot);
  if (!head) return; // Not a git repo or no commits

  const lastHead = store.getFileHash(GIT_HEAD_KEY);
  if (lastHead === head) return; // HEAD unchanged — skip

  // Clear all old co_changes_with edges from git provenance
  const oldEdges = store.queryRows<{ source: string; target: string }>(
    "SELECT source, target FROM edges WHERE kind = 'co_changes_with' AND provenance_source = 'git'"
  );
  for (const e of oldEdges) {
    store.deleteEdge(e.source, e.target, "co_changes_with", "git");
  }

  const minCount = options.minCoChangeCount ?? 2;
  const windowDays = options.windowDays ?? 365;

  const commits = parseGitLog(projectRoot);
  if (commits.length === 0) {
    store.setFileHash(GIT_HEAD_KEY, head);
    return;
  }

  // ... (rest of co-occurrence logic stays the same)

  // After creating all edges:
  store.setFileHash(GIT_HEAD_KEY, head);
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-git-incremental.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
