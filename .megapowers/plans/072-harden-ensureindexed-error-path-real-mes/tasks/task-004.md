---
id: 4
title: "RC-A/git: guard writes in runGitCoChangeStage"
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/indexer/git.ts
files_to_create:
  - test/git-stage-guarded-writes.test.ts
---

Guard the three unguarded store mutations in `runGitCoChangeStage`:
`store.deleteEdge` at `src/indexer/git.ts:90`, `store.addEdge` at
`src/indexer/git.ts:135`, and `store.setFileHash(GIT_HEAD_KEY, head)` at
`src/indexer/git.ts:149`. A transient write failure must not abort the
stage.

**Files:**
- Modify: `src/indexer/git.ts`
- Create: `test/git-stage-guarded-writes.test.ts`

**Step 1 — Write the failing test**

Create `test/git-stage-guarded-writes.test.ts`:

```ts
import { expect, test, describe } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runGitCoChangeStage } from "../src/indexer/git.js";
import type { GraphEdge } from "../src/graph/types.js";

function initGitRepo(dir: string): void {
  execSync("git init -q", { cwd: dir });
  execSync("git config user.email pi@test.local", { cwd: dir });
  execSync("git config user.name PiTest", { cwd: dir });
}

function commit(dir: string, files: Array<{ path: string; content: string }>, message: string): void {
  for (const f of files) {
    const full = join(dir, f.path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, f.content);
  }
  execSync("git add -A", { cwd: dir });
  execSync(`git commit -q -m "${message}"`, { cwd: dir });
}

describe("RC-A/git: runGitCoChangeStage writes are guarded", () => {
  test("addEdge throw during co-change write does not abort the stage", async () => {
    const dir = join(tmpdir(), `pi-cg-git-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    try {
      initGitRepo(dir);
      // Three files that co-change twice → three pairs.
      commit(dir, [
        { path: "src/a.ts", content: "export const a = 1;\n" },
        { path: "src/b.ts", content: "export const b = 1;\n" },
        { path: "src/c.ts", content: "export const c = 1;\n" },
      ], "first");
      commit(dir, [
        { path: "src/a.ts", content: "export const a = 2;\n" },
        { path: "src/b.ts", content: "export const b = 2;\n" },
        { path: "src/c.ts", content: "export const c = 2;\n" },
      ], "second");

      const store = new SqliteGraphStore(join(dir, "graph.db"));
      // Pre-populate nodes so findNodes(file) returns hits.
      for (const rel of ["src/a.ts", "src/b.ts", "src/c.ts"]) {
        store.addNode({
          id: `${rel}::__module__`, kind: "module", name: rel,
          file: rel, start_line: 1, end_line: 1, content_hash: "h", is_exported: false,
        });
        store.setFileHash(rel, "h");
      }

      // Force the first co-change addEdge to throw.
      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let coChangeCalls = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.kind === "co_changes_with" && edge.provenance.source === "git") {
          coChangeCalls++;
          if (coChangeCalls === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      try {
        await runGitCoChangeStage(store, dir);
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      // All three pairs were attempted.
      expect(coChangeCalls).toBe(3);
      // At least one co_changes_with edge was persisted (from the pairs after the failure).
      const coEdges = store.queryRows<{ source: string; target: string }>(
        "SELECT source, target FROM edges WHERE kind = 'co_changes_with' AND provenance_source = 'git'",
      );
      expect(coEdges.length).toBeGreaterThanOrEqual(2);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/git-stage-guarded-writes.test.ts`

Expected: FAIL — Bun prints:
```
error: SQLITE_BUSY: database is locked
    at ... src/indexer/git.ts:135 ...
```
The stage aborts after the first failed `addEdge`, so `coChangeCalls` never
reaches 3.

**Step 3 — Write minimal implementation**

Edit `src/indexer/git.ts`. Three changes, all try/catch with
continue-on-failure semantics:

Change 1 — the old-edge cleanup loop (`src/indexer/git.ts:89-91`):

Before:
```ts
  for (const edge of oldEdges) {
    store.deleteEdge(edge.source, edge.target, "co_changes_with", "git");
  }
```
After:
```ts
  for (const edge of oldEdges) {
    try {
      store.deleteEdge(edge.source, edge.target, "co_changes_with", "git");
    } catch {
      // transient write failure — skip this edge, continue stage
    }
  }
```

Change 2 — the per-pair write loop (`src/indexer/git.ts:125-147`). Wrap the
`store.addEdge({...})` block:

Before:
```ts
  for (const [key, data] of pairCounts) {
    if (data.count < minCount) continue;

    const [fileA, fileB] = key.split("|");
    const nodeA = store.findNodes(fileA!)[0];
    const nodeB = store.findNodes(fileB!)[0];
    if (!nodeA || !nodeB) continue;

    const evidence = `co_changes: ${data.count}, recency_score: ${data.weightedScore.toFixed(1)}, window: ${windowDays}d`;

    store.addEdge({
      source: nodeA.id,
      target: nodeB.id,
      kind: "co_changes_with",
      provenance: {
        source: "git",
        confidence: Math.min(0.9, 0.3 + data.count * 0.1),
        evidence,
        content_hash: nodeA.content_hash,
      },
      created_at: Date.now(),
    });
  }
```
After:
```ts
  for (const [key, data] of pairCounts) {
    if (data.count < minCount) continue;

    const [fileA, fileB] = key.split("|");
    const nodeA = store.findNodes(fileA!)[0];
    const nodeB = store.findNodes(fileB!)[0];
    if (!nodeA || !nodeB) continue;

    const evidence = `co_changes: ${data.count}, recency_score: ${data.weightedScore.toFixed(1)}, window: ${windowDays}d`;

    try {
      store.addEdge({
        source: nodeA.id,
        target: nodeB.id,
        kind: "co_changes_with",
        provenance: {
          source: "git",
          confidence: Math.min(0.9, 0.3 + data.count * 0.1),
          evidence,
          content_hash: nodeA.content_hash,
        },
        created_at: Date.now(),
      });
    } catch {
      // transient write failure — skip this pair, continue stage
    }
  }
```

Change 3 — the terminal `setFileHash` at `src/indexer/git.ts:98` (early
return) and `src/indexer/git.ts:149` (normal return):

Before:
```ts
  if (commits.length === 0) {
    store.setFileHash(GIT_HEAD_KEY, head);
    return;
  }
```
After:
```ts
  if (commits.length === 0) {
    try { store.setFileHash(GIT_HEAD_KEY, head); } catch { /* transient write failure */ }
    return;
  }
```

And at end-of-function:

Before:
```ts
  store.setFileHash(GIT_HEAD_KEY, head);
}
```
After:
```ts
  try { store.setFileHash(GIT_HEAD_KEY, head); } catch { /* transient write failure */ }
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/git-stage-guarded-writes.test.ts`

Expected: PASS — `coChangeCalls === 3`, at least 2 co-change edges persist.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.
