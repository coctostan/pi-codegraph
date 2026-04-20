# Plan

### Task 1: RC-C: indexingFailedNote surfaces lastIndexError.message verbatim

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

### Task 2: RC-A/LSP: guard unresolved-branch write pair in runLspIndexStage [depends: 1]

Wrap the `deleteEdge` + `addEdge` pair at `src/indexer/lsp.ts:79-80` (the
*unresolved-target* branch) in a try/catch that continues the loop on
failure. This is the exact unguarded write-pair the reproduction uses to
trigger the bug.

**Files:**
- Modify: `src/indexer/lsp.ts`
- Create: `test/lsp-stage-guarded-writes.test.ts`

**Step 1 — Write the failing test**

Current `runLspIndexStage` signature (from `read`):
```ts
export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<void>
```

Create `test/lsp-stage-guarded-writes.test.ts`:

```ts
import { expect, test, describe } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runLspIndexStage } from "../src/indexer/lsp.js";
import type { GraphEdge } from "../src/graph/types.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

function makeStore(): { store: SqliteGraphStore; dir: string } {
  const dir = join(tmpdir(), `pi-cg-lsp-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const store = new SqliteGraphStore(join(dir, "graph.db"));
  return { store, dir };
}

describe("RC-A/LSP: unresolved-branch writes are guarded", () => {
  test("one addEdge throw does not abort the stage; remaining edges still written", async () => {
    const { store, dir } = makeStore();
    try {
      // Two source functions in the same file, each with one unresolved call.
      store.addNode({
        id: "src/x.ts::__module__", kind: "module", name: "src/x.ts",
        file: "src/x.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false,
      });
      store.addNode({
        id: "src/x.ts::callerA", kind: "function", name: "callerA",
        file: "src/x.ts", start_line: 2, end_line: 2, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/x.ts::callerB", kind: "function", name: "callerB",
        file: "src/x.ts", start_line: 5, end_line: 5, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/x.ts::targetA", kind: "function", name: "targetA",
        file: "src/x.ts", start_line: 10, end_line: 10, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/x.ts::targetB", kind: "function", name: "targetB",
        file: "src/x.ts", start_line: 20, end_line: 20, content_hash: "h", is_exported: true,
      });
      const unresolvedA: GraphEdge = {
        source: "src/x.ts::callerA",
        target: "__unresolved__::targetA",
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetA:2:1", content_hash: "h" },
        created_at: 1,
      };
      const unresolvedB: GraphEdge = {
        source: "src/x.ts::callerB",
        target: "__unresolved__::targetB",
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetB:5:1", content_hash: "h" },
        created_at: 2,
      };
      store.addEdge(unresolvedA);
      store.addEdge(unresolvedB);

      // Fake client resolves both calls to their respective target lines.
      const client: ITsServerClient = {
        async definition(_f, line, _c) {
          if (line === 2) return { file: "src/x.ts", line: 10, col: 1 };
          if (line === 5) return { file: "src/x.ts", line: 20, col: 1 };
          return null;
        },
        async references() { return []; },
        async implementations() { return []; },
        async shutdown() {},
      };

      // Monkey-patch addEdge to throw the first time an LSP-provenance edge is written,
      // and succeed for the second.
      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let lspCalls = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.provenance.source === "lsp") {
          lspCalls++;
          if (lspCalls === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      try {
        // The stage must not throw.
        await runLspIndexStage(store, dir, client);
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      // Both LSP writes were attempted.
      expect(lspCalls).toBe(2);

      // The second edge (callerB -> targetB) must now be a resolved LSP edge.
      const edgesFromB = store.getEdgesBySource("src/x.ts::callerB");
      const resolvedB = edgesFromB.find(
        (e) => e.kind === "calls" && e.provenance.source === "lsp" && e.target === "src/x.ts::targetB",
      );
      expect(resolvedB).toBeDefined();
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/lsp-stage-guarded-writes.test.ts`

Expected: FAIL — Bun prints the thrown error propagating out of the stage:
```
error: SQLITE_BUSY: database is locked
    at ... src/indexer/lsp.ts:80 ...
```
The assertions below are never reached because `runLspIndexStage` throws.

**Step 3 — Write minimal implementation**

Current unresolved branch (`src/indexer/lsp.ts:74-82`):

```ts
    if (isUnresolvedTarget(edge.target)) {
      const targetNode = store
        .getNodesByFile(loc.file)
        .find((n) => n.name === parsed.name && n.start_line === loc.line);
      if (!targetNode) continue;
      store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
      store.addEdge(makeLspEdge(edge.source, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
      continue;
    }
```

Replace with a guarded write pair (leave the confirmed-edge branch at lines
84-91 alone — that's Task 3):

```ts
    if (isUnresolvedTarget(edge.target)) {
      const targetNode = store
        .getNodesByFile(loc.file)
        .find((n) => n.name === parsed.name && n.start_line === loc.line);
      if (!targetNode) continue;
      try {
        store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
        store.addEdge(makeLspEdge(edge.source, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
      } catch {
        // transient write failure — skip this edge, continue stage
      }
      continue;
    }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/lsp-stage-guarded-writes.test.ts`

Expected: PASS — `lspCalls === 2`, `resolvedB` edge is present in the store.

**Step 5 — Verify no regressions**
Run: `bun test`

Expected: all passing. Task 1's `test/ensure-indexed-error-message.test.ts`
uses a `SqliteGraphStore.prototype.listFiles` throw path that is called from
`src/indexer/pipeline.ts:96` and `src/indexer/lsp.ts:46` — both *outside*
the per-item try/catch introduced here. That regression therefore stays red
on the baseline and remains green after Task 1 without any changes to Task
1's test file from this task.

### Task 3: RC-A/LSP: guard confirmed-branch write pair in runLspIndexStage [depends: 2]

Wrap the `deleteEdge` + `addEdge` pair at `src/indexer/lsp.ts:90-91` (the
*confirmed-edge* branch) in the same try/catch pattern applied to the
unresolved branch in Task 2.

**Files:**
- Modify: `src/indexer/lsp.ts`
- Test: `test/lsp-stage-guarded-writes.test.ts` (extend from Task 2)

**Step 1 — Write the failing test**

Append a second test to `test/lsp-stage-guarded-writes.test.ts` (created in
Task 2). Place the new test inside the existing `describe(...)` block:

```ts
  test("confirmed-branch: one addEdge throw does not abort the stage", async () => {
    const { store, dir } = makeStore();
    try {
      // Pre-existing LSP-confirmed edge (so loop enters the confirmed-edge branch).
      store.addNode({
        id: "src/y.ts::__module__", kind: "module", name: "src/y.ts",
        file: "src/y.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false,
      });
      store.addNode({
        id: "src/y.ts::callerA", kind: "function", name: "callerA",
        file: "src/y.ts", start_line: 2, end_line: 2, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/y.ts::callerB", kind: "function", name: "callerB",
        file: "src/y.ts", start_line: 5, end_line: 5, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/y.ts::targetA", kind: "function", name: "targetA",
        file: "src/y.ts", start_line: 10, end_line: 10, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/y.ts::targetB", kind: "function", name: "targetB",
        file: "src/y.ts", start_line: 20, end_line: 20, content_hash: "h", is_exported: true,
      });
      // tree-sitter edges with resolved targets (not __unresolved__) — these enter the confirmed branch.
      const resolvedA: GraphEdge = {
        source: "src/y.ts::callerA",
        target: "src/y.ts::targetA",
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetA:2:1", content_hash: "h" },
        created_at: 1,
      };
      const resolvedB: GraphEdge = {
        source: "src/y.ts::callerB",
        target: "src/y.ts::targetB",
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5, evidence: "targetB:5:1", content_hash: "h" },
        created_at: 2,
      };
      store.addEdge(resolvedA);
      store.addEdge(resolvedB);
      // `runLspIndexStage` builds its confirmed-branch work list by iterating
      // `store.listFiles()` (src/indexer/lsp.ts:45-54). Without a file-hash row
      // for src/y.ts, `listFiles()` returns [] and the confirmed branch never
      // runs — the test would fail at `expect(lspCalls).toBe(2)` with
      // `Received: 0` instead of exercising the actual bug. Seed the file hash
      // so the confirmed branch is reached.
      store.setFileHash("src/y.ts", "h");
      const client: ITsServerClient = {
        async definition(_f, line, _c) {
          if (line === 2) return { file: "src/y.ts", line: 10, col: 1 };
          if (line === 5) return { file: "src/y.ts", line: 20, col: 1 };
          return null;
        },
        async references() { return []; },
        async implementations() { return []; },
        async shutdown() {},
      };

      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let lspCalls = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.provenance.source === "lsp") {
          lspCalls++;
          if (lspCalls === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      try {
        await runLspIndexStage(store, dir, client);
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      expect(lspCalls).toBe(2);
      const edgesB = store.getEdgesBySource("src/y.ts::callerB");
      const lspEdgeB = edgesB.find(
        (e) => e.kind === "calls" && e.provenance.source === "lsp" && e.target === "src/y.ts::targetB",
      );
      expect(lspEdgeB).toBeDefined();
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/lsp-stage-guarded-writes.test.ts`

Expected: FAIL on the new test — Bun prints:
```
error: SQLITE_BUSY: database is locked
    at ... src/indexer/lsp.ts:91 ...
```
The first test (Task 2) still passes.

**Step 3 — Write minimal implementation**

Current confirmed branch (`src/indexer/lsp.ts:84-91`):

```ts
    const existingTarget = store.getNode(edge.target);
    if (!existingTarget) continue;

    const sameTarget = existingTarget.file === loc.file && existingTarget.start_line === loc.line;
    if (!sameTarget) continue;

    store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
    store.addEdge(makeLspEdge(edge.source, edge.target, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
  }
```

Change the last two lines to a guarded pair:

```ts
    try {
      store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
      store.addEdge(makeLspEdge(edge.source, edge.target, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
    } catch {
      // transient write failure — skip this edge, continue stage
    }
  }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/lsp-stage-guarded-writes.test.ts`

Expected: PASS — both tests pass; `lspCalls === 2` and `lspEdgeB` is present.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.

### Task 4: RC-A/git: guard writes in runGitCoChangeStage [depends: 3]

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

### Task 5: RC-A/ast-grep: guard writes in applyRoutesToMatches and applyRendersMatches [depends: 4]

Guard the three unguarded store mutations in `applyRoutesToMatches` (`addNode` at line
208, `addEdge` at line 209) and `applyRendersMatches` (`addEdge` at line 244). Per-match
failures must not abort the stage.

This task explicitly covers two guarded sites: the `routes_to` test forces a failure
on `store.addNode(endpointNode)` (proving the `addNode` guard) and the `renders` test
forces a failure on `store.addEdge` (proving the `addEdge` guard in
`applyRendersMatches`). Together with the `addEdge` wrap inside
`applyRoutesToMatches` (which is inside the same guarded block as `addNode`), all
three write sites from `src/indexer/ast-grep.ts:208, 209, 244` are covered.

**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Create: `test/ast-grep-guarded-writes.test.ts`

**Step 1 — Write the failing test**

Exports from `src/indexer/ast-grep.ts` (confirmed via `read`):
```ts
export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void
export interface AstGrepRule { name; pattern; lang; produces: { edge_kind; from_capture?; ...; confidence; } }
export interface SgMatch { file: string; line: number; column: number; metaVariables: Record<string, string | string[]>; }
```

Create `test/ast-grep-guarded-writes.test.ts`:

```ts
import { expect, test, describe } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { applyRuleMatches, type AstGrepRule, type SgMatch } from "../src/indexer/ast-grep.js";
import type { GraphEdge } from "../src/graph/types.js";

function makeStore(): { store: SqliteGraphStore; dir: string } {
  const dir = join(tmpdir(), `pi-cg-astgrep-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const store = new SqliteGraphStore(join(dir, "graph.db"));
  return { store, dir };
}

describe("RC-A/ast-grep: applyRuleMatches writes are guarded", () => {
  test("routes_to: addNode throw does not abort the stage", () => {
    const { store, dir } = makeStore();
    try {
      store.addNode({
        id: "src/r.ts::handlerA", kind: "function", name: "handlerA",
        file: "src/r.ts", start_line: 10, end_line: 10, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/r.ts::handlerB", kind: "function", name: "handlerB",
        file: "src/r.ts", start_line: 20, end_line: 20, content_hash: "h", is_exported: true,
      });
      const rule: AstGrepRule = {
        name: "express-route",
        pattern: "...",
        lang: "typescript",
        produces: {
          edge_kind: "routes_to",
          from_capture: "HANDLER",
          to_template: "endpoint:{METHOD}:{PATH}",
          confidence: 0.8,
        },
      };
      const matches: SgMatch[] = [
        {
          file: "src/r.ts",
          line: 10,
          column: 1,
          metaVariables: { METHOD: "get", PATH: "/a", HANDLER: "handlerA" },
        },
        {
          file: "src/r.ts",
          line: 20,
          column: 1,
          metaVariables: { METHOD: "get", PATH: "/b", HANDLER: "handlerB" },
        },
      ];

      // Fault the endpoint `addNode` call, not `addEdge`. This forces the
      // implementation to wrap `store.addNode(endpointNode)` (src/indexer/ast-grep.ts:208)
      // in a try/catch as well — guarding only `store.addEdge(...)` would let the
      // first throw propagate out of `applyRoutesToMatches` and abort the stage.
      const originalAddNode = SqliteGraphStore.prototype.addNode;
      let endpointNodeWrites = 0;
      SqliteGraphStore.prototype.addNode = function (node) {
        if (node.kind === "endpoint") {
          endpointNodeWrites++;
          if (endpointNodeWrites === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddNode.call(this, node);
      };

      try {
        applyRuleMatches(store, rule, matches);
      } finally {
        SqliteGraphStore.prototype.addNode = originalAddNode;
      }

      // Both matches attempted an endpoint addNode — stage did not abort.
      expect(endpointNodeWrites).toBe(2);
      // The second match persisted a `routes_to` edge for handlerB.
      const edges = store.queryRows<{ source: string }>(
        "SELECT source FROM edges WHERE kind = 'routes_to' AND provenance_source = 'ast-grep'",
      );
      expect(edges.length).toBe(1);
      expect(edges[0]!.source).toBe("src/r.ts::handlerB");
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("renders: addEdge throw does not abort the stage", () => {
    const { store, dir } = makeStore();
    try {
      store.addNode({
        id: "src/v.tsx::Page", kind: "function", name: "Page",
        file: "src/v.tsx", start_line: 1, end_line: 50, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/v.tsx::HeaderA", kind: "function", name: "HeaderA",
        file: "src/v.tsx", start_line: 60, end_line: 60, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/v.tsx::HeaderB", kind: "function", name: "HeaderB",
        file: "src/v.tsx", start_line: 70, end_line: 70, content_hash: "h", is_exported: true,
      });

      const rule: AstGrepRule = {
        name: "react-render",
        pattern: "...",
        lang: "typescript",
        produces: {
          edge_kind: "renders",
          from_context: "enclosing_function",
          to_capture: "COMPONENT",
          confidence: 0.7,
        },
      };
      const matches: SgMatch[] = [
        { file: "src/v.tsx", line: 10, column: 1, metaVariables: { COMPONENT: "HeaderA" } },
        { file: "src/v.tsx", line: 20, column: 1, metaVariables: { COMPONENT: "HeaderB" } },
      ];

      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let renderWrites = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.kind === "renders") {
          renderWrites++;
          if (renderWrites === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      try {
        applyRuleMatches(store, rule, matches);
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      expect(renderWrites).toBe(2);
      const edges = store.queryRows<{ source: string }>(
        "SELECT source FROM edges WHERE kind = 'renders' AND provenance_source = 'ast-grep'",
      );
      expect(edges.length).toBe(1);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/ast-grep-guarded-writes.test.ts`

Expected: FAIL — both tests abort because `SQLITE_BUSY: database is locked`
propagates out of `applyRuleMatches`. The runner prints, for example for the
`routes_to` test:
```
error: SQLITE_BUSY: database is locked
    at ... src/indexer/ast-grep.ts:208 ...
```
and for the `renders` test:
```
error: SQLITE_BUSY: database is locked
    at ... src/indexer/ast-grep.ts:244 ...
```
The `expect(...)` assertions are never reached.

**Step 3 — Write minimal implementation**

Edit `src/indexer/ast-grep.ts`:

Change 1 — `applyRoutesToMatches` inner-loop body at lines 197-221. Wrap
`store.addNode` + `store.addEdge` as one guarded block:

Before (lines 196-221):
```ts
    for (const handlerName of metaValues(match.metaVariables, rule.produces.from_capture ?? "")) {
      const handlerNode = store.findNodes(handlerName, match.file)[0];
      if (!handlerNode) continue;
      const endpointNode: GraphNode = { /* ... */ };
      store.addNode(endpointNode);
      store.addEdge({ /* ... */ });
    }
```
After:
```ts
    for (const handlerName of metaValues(match.metaVariables, rule.produces.from_capture ?? "")) {
      const handlerNode = store.findNodes(handlerName, match.file)[0];
      if (!handlerNode) continue;
      const endpointNode: GraphNode = {
        id: endpointId,
        kind: "endpoint",
        name: endpointId,
        file: match.file,
        start_line: match.line,
        end_line: match.line,
        content_hash: handlerNode.content_hash,
      };
      try {
        store.addNode(endpointNode);
        store.addEdge({
          source: handlerNode.id,
          target: endpointId,
          kind: "routes_to",
          provenance: {
            source: "ast-grep",
            confidence: rule.produces.confidence,
            evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`,
            content_hash: handlerNode.content_hash,
          },
          created_at: Date.now(),
        });
      } catch {
        // transient write failure — skip this match, continue stage
      }
    }
```

Change 2 — `applyRendersMatches` body at lines 237-255. Wrap `store.addEdge`:

Before (lines 244-255):
```ts
    store.addEdge({
      source: sourceNode.id,
      target: targetNode.id,
      kind: "renders",
      provenance: {
        source: "ast-grep",
        confidence: rule.produces.confidence,
        evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`,
        content_hash: sourceNode.content_hash,
      },
      created_at: Date.now(),
    });
```
After:
```ts
    try {
      store.addEdge({
        source: sourceNode.id,
        target: targetNode.id,
        kind: "renders",
        provenance: {
          source: "ast-grep",
          confidence: rule.produces.confidence,
          evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`,
          content_hash: sourceNode.content_hash,
        },
        created_at: Date.now(),
      });
    } catch {
      // transient write failure — skip this match, continue stage
    }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/ast-grep-guarded-writes.test.ts`

Expected: PASS — both tests pass. `routes_to`: `endpointNodeWrites === 2` and
the second match's `routes_to` edge (handlerB) is persisted. `renders`:
`renderWrites === 2` and the second match's `renders` edge persists.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.

### Task 6: RC-A accounting: per-stage write errors bump IndexResult.errors [depends: 5]

Currently `IndexResult.errors` only reflects tree-sitter + `deleteFile`
failures. After Tasks 2–5 swallow write failures in async stages, callers
lose the signal that indexing was partial. Thread a per-stage error counter
through the pipeline so the catch-and-continue blocks increment `errors`.

**Files:**
- Modify: `src/indexer/lsp.ts`
- Modify: `src/indexer/git.ts`
- Modify: `src/indexer/ast-grep.ts`
- Modify: `src/indexer/pipeline.ts`
- Create: `test/pipeline-stage-error-accounting.test.ts`

**Step 1 — Write the failing test**

Current contract (from `read` on `src/indexer/pipeline.ts`):
```ts
export interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
  timings: Record<string, number>;
}
export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult>
```

Create `test/pipeline-stage-error-accounting.test.ts`:

```ts
import { expect, test, describe } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { GraphEdge } from "../src/graph/types.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

describe("RC-A accounting: stage write failures bump result.errors", () => {
  test("LSP stage write failure increments errors, does not abort pipeline", async () => {
    const dir = join(tmpdir(), `pi-cg-pipeline-errors-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
    );
    try {
      const store = new SqliteGraphStore(join(dir, "graph.db"));
      const fakeClient: ITsServerClient = {
        async definition(_f, _line, _col) {
          return { file: "src/hello.ts", line: 1, col: 1 };
        },
        async references() { return []; },
        async implementations() { return []; },
        async shutdown() {},
      };

      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let lspWrites = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.provenance.source === "lsp") {
          lspWrites++;
          throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      let result;
      try {
        result = await indexProject(dir, store, { lspClientFactory: () => fakeClient });
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      // All planned LSP writes were attempted (stage did not abort on first throw).
      expect(lspWrites).toBeGreaterThanOrEqual(1);
      // Pipeline completed and returned a result.
      expect(result).toBeDefined();
      // Every failed guarded write bumps errors.
      expect(result.errors).toBeGreaterThanOrEqual(lspWrites);

      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/pipeline-stage-error-accounting.test.ts`

Expected: FAIL —
```
error: expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 1
Received: 0
```
The guarded catch blocks added in Tasks 2–5 currently swallow the error
silently and `result.errors` stays at 0.

**Step 3 — Write minimal implementation**

Add an `errors` counter to each stage's public signature as an optional
`out` parameter, and return it.

Change 1 — `src/indexer/lsp.ts`: change `runLspIndexStage` return type from
`Promise<void>` to `Promise<number>` (error count). Increment in each
catch block.

Before (abbreviated):
```ts
export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  /* ... loop with guarded writes from Tasks 2 + 3 ... */
}
```
After:
```ts
export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<number> {
  let errors = 0;
  /* ... same loop; replace `} catch { /* ... */ }` blocks with
     `} catch { errors++; }` ... */
  return errors;
}
```

Both catch blocks added in Tasks 2 and 3 change from empty body to
`errors++;`.

Change 2 — `src/indexer/git.ts`: change `runGitCoChangeStage` return type
from `Promise<void>` to `Promise<number>`. Initialize `let errors = 0`
before the early-return branch. Replace each of the four catch blocks from
Task 4 with `errors++;`. Return `errors` from both `return` statements (add
`return errors;` where there's currently a bare `return;`).

Specifically (`src/indexer/git.ts`, signature line 75-79):
```ts
export async function runGitCoChangeStage(
  store: GraphStore,
  projectRoot: string,
  options: GitCoChangeOptions = {},
): Promise<number> {
  let errors = 0;
  const head = getCurrentHead(projectRoot);
  if (!head) return errors;

  const lastHead = store.getFileHash(GIT_HEAD_KEY);
  if (lastHead === head) return errors;

  /* ... rest of body ... */
  try { store.setFileHash(GIT_HEAD_KEY, head); } catch { errors++; }
  return errors;
}
```

The early-return for `commits.length === 0` also becomes:
```ts
  if (commits.length === 0) {
    try { store.setFileHash(GIT_HEAD_KEY, head); } catch { errors++; }
    return errors;
  }
```

Change 3 — `src/indexer/ast-grep.ts`: both `applyRoutesToMatches` and
`applyRendersMatches` return `number`. `applyRuleMatches` returns `number`.
`runAstGrepIndexStage` returns `Promise<number>`.

```ts
function applyRoutesToMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): number {
  let errors = 0;
  /* ... existing loop; change each catch block added in Task 5 from empty to `errors++;` ... */
  return errors;
}

function applyRendersMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): number {
  let errors = 0;
  /* ... existing loop; change each catch block added in Task 5 from empty to `errors++;` ... */
  return errors;
}

export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): number {
  if (rule.produces.edge_kind === "routes_to") return applyRoutesToMatches(store, rule, matches);
  if (rule.produces.edge_kind === "renders") return applyRendersMatches(store, rule, matches);
  return 0;
}

export async function runAstGrepIndexStage(
  store: GraphStore,
  projectRoot: string,
  files: string[],
  scanFn: typeof runScan = runScan,
): Promise<number> {
  let errors = 0;
  if (files.length === 0) return errors;
  const bundledDir = fileURLToPath(new URL("../rules/", import.meta.url));
  const rules = loadRules({ bundledDir, projectRoot });
  for (const rule of rules) {
    const matches = await scanFn(projectRoot, rule, files);
    errors += applyRuleMatches(store, rule, matches);
  }
  return errors;
}
```

Change 4 — `src/indexer/pipeline.ts`: fold the returned counters into the
outer `errors` total. Edit lines 109-126:

Before:
```ts
  try {
    await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  timings["lsp"] = Math.round(performance.now() - lspStart);

  const astGrepStart = performance.now();
  await runAstGrepIndexStage(store, projectRoot, changedFiles);
  timings["ast-grep"] = Math.round(performance.now() - astGrepStart);

  const coverageStart = performance.now();
  runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
  timings["coverage"] = Math.round(performance.now() - coverageStart);

  const gitStart = performance.now();
  await runGitCoChangeStage(store, projectRoot);
  timings["git"] = Math.round(performance.now() - gitStart);
```
After:
```ts
  try {
    errors += await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  timings["lsp"] = Math.round(performance.now() - lspStart);

  const astGrepStart = performance.now();
  errors += await runAstGrepIndexStage(store, projectRoot, changedFiles);
  timings["ast-grep"] = Math.round(performance.now() - astGrepStart);

  const coverageStart = performance.now();
  runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
  timings["coverage"] = Math.round(performance.now() - coverageStart);

  const gitStart = performance.now();
  errors += await runGitCoChangeStage(store, projectRoot);
  timings["git"] = Math.round(performance.now() - gitStart);
```

No changes to `runCoverageIndexStage` (it already has no unguarded
mutations introduced by this batch; leave its void return as-is).

No changes needed to `IndexResult` — the existing `errors: number` field is
the accumulator.

**Step 4 — Run test, verify it passes**

Run: `bun test test/pipeline-stage-error-accounting.test.ts`

Expected: PASS — `result.errors >= lspWrites`.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. In particular:
- Tests 2–5 still pass (they never read the returned count).
- `test/readonly-graceful-degradation.test.ts` still passes — a real
  readonly DB makes every guarded `store.addEdge` throw → `errors > 0` →
  `ensureIndexed` sets `lastIndexError = new Error("readonly database")`
  at `src/index.ts:104-105` (unchanged logic).

### Task 7: RC-D stickiness: clear lastIndexError on evidence of store health [depends: 1]

When a tool successfully produces output via `finalizeReadOnlyOutput`, the
store responded to reads — treat that as evidence of store health and
clear `lastIndexError`. Do **not** clear when the literal message is
`"readonly database"` (verified-persistent, set by the
`result.errors > 0 && !dbIsWritable(projectRoot)` branch in
`ensureIndexed`).

**Files:**
- Modify: `src/index.ts`
- Create: `test/last-index-error-clear-on-health.test.ts`

**Step 1 — Write the failing test**
The previous design (listFiles throws on call-1 only) is green on baseline:
`ensureIndexed`'s existing happy-path branch at `src/index.ts:106-107` already
clears `lastIndexError` when call-2's `indexProject` returns with
`errors === 0`. That's not a real red/green driver for the clear-on-success
hook.

Instead, drive `ensureIndexed.catch` with a configurable `listFiles` throw so
`lastIndexError` is reliably set at the start of every tool call. Then
introspect `getLastIndexErrorForTesting()` after each call to prove the
post-prefix hook ran for transient messages and was bypassed for the literal
`"readonly database"`. Also introduce a test-only `setLastIndexErrorForTesting`
setter so Task 8 can upgrade its signature to include `setAt`.

Create `test/last-index-error-clear-on-health.test.ts`:

```ts
import { expect, test, describe, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
function createTestProject(): string {
  const root = join(tmpdir(), `pi-cg-sticky-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src/hello.ts"),
    "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
  );
  return root;
}
function populateStore(projectRoot: string): void {
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const store = new SqliteGraphStore(join(dbDir, "graph.db"));
  const content = "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n";
  const extracted = extractFile("src/hello.ts", content);
  store.addNode(extracted.module);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);
  store.setFileHash("src/hello.ts", sha256Hex(content));
  store.close();
}
describe("RC-D: lastIndexError clears on store-health evidence", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  test("finalizeReadOnlyOutput clears transient lastIndexError but preserves 'readonly database'", async () => {
    const root = createTestProject();
    dirs.push(root);
    populateStore(root);
    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();
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

    // Patch listFiles to throw a configurable message on every call. The
    // throw propagates up through `indexProject` into `ensureIndexed`'s
    // catch at `src/index.ts:109-112`, which sets
    // `lastIndexError = new Error(pendingMessage)`. This reliably primes
    // the flag at the top of each tool call, regardless of the pre-populated
    // store's hash-match skip path.
    const origListFiles = SqliteGraphStore.prototype.listFiles;
    let pendingMessage: string | null = null;
    SqliteGraphStore.prototype.listFiles = function () {
      if (pendingMessage) throw new Error(pendingMessage);
      return origListFiles.call(this);
    };

    try {
      const ctx = { cwd: root };
      // --- Phase 1: transient non-readonly error ---
      // The hook must clear lastIndexError AFTER the note is rendered.
      pendingMessage = "transient scan failure";
      const r1 = await sgExecute!("c1", { name: "alpha" }, undefined, undefined, ctx);
      const t1: string = r1.content[0]?.text ?? "";
      // THIS call's output still carries the accurate message (Task 1's
      // contract): the clear hook runs AFTER the note is built.
      expect(t1).toContain("alpha");
      expect(t1).toContain("indexing-failed");
      expect(t1).toContain("transient scan failure");
      // Post-prefix hook must have wiped the flag by the time the call returns.
      expect(mod.getLastIndexErrorForTesting()).toBeNull();
      // --- Phase 2: verified-readonly literal ---
      // The hook must NOT clear when the message is exactly "readonly database".
      pendingMessage = "readonly database";
      const r2 = await sgExecute!("c2", { name: "alpha" }, undefined, undefined, ctx);
      const t2: string = r2.content[0]?.text ?? "";
      expect(t2).toContain("alpha");
      expect(t2).toContain("indexing-failed");
      expect(t2).toContain("readonly database");
      // Flag survives — the "readonly database" literal is verified-persistent.
      expect(mod.getLastIndexErrorForTesting()?.message).toBe("readonly database");
      // --- Phase 3: sanity check via the test setter ---
      // Confirm the new setter is callable and can reset state.
      mod.setLastIndexErrorForTesting(null);
      expect(mod.getLastIndexErrorForTesting()).toBeNull();
    } finally {
      SqliteGraphStore.prototype.listFiles = origListFiles;
      mod.setLastIndexErrorForTesting(null);
      mod.resetStoreForTesting();
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/last-index-error-clear-on-health.test.ts`

Expected: FAIL — on baseline the helper does not exist yet, so Bun prints:
```
TypeError: mod.setLastIndexErrorForTesting is not a function
    at .../test/last-index-error-clear-on-health.test.ts
```

Even after scaffolding the setter (but before adding the clear hook), the
test still fails at:
```
error: expect(received).toBeNull()

Received: [Error: transient scan failure]
```
because `finalizeReadOnlyOutput` has no clear-on-healthy-read hook, so the
transient error survives call-1.

**Step 3 — Write minimal implementation**
Two edits to `src/index.ts`:

(a) Add a test-only setter next to `getLastIndexErrorForTesting` at
`src/index.ts:70-72`. Task 8 will later upgrade the signature to include
`setAt` for the age timestamp; keep Task 7's shape `Error | null`:

```ts
export function setLastIndexErrorForTesting(error: Error | null): void {
  lastIndexError = error;
}
```

(b) Edit `finalizeReadOnlyOutput` at `src/index.ts:120-130`. The clear
decision must happen **after** `indexingFailedNote()` has been prepended —
otherwise it would suppress the current call's note too, which would break
Task 1's first-call assertion that the real captured message is surfaced
verbatim. This task's contract is explicitly "the *second* tool invocation
against a healthy store does not contain the 'indexing-failed' note"
(Fixed When #6).
Before:
```ts
function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
  const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}
```
After:
```ts
function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
  const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
  // Reaching this point means the tool's read path against the store
  // succeeded and produced output. Clear transient (non-readonly)
  // lastIndexError AFTER the note is built so THIS tool output still
  // carries the accurate error message (Task 1's contract), but the NEXT
  // tool call starts with a clean flag. The "readonly database" literal is
  // verified-persistent via ensureIndexed's `result.errors > 0 &&
  // !dbIsWritable(projectRoot)` branch and must stay set across tool calls.
  if (
    lastIndexError &&
    lastIndexError.message !== "readonly database" &&
    withoutFreshHeader.trim().length > 0
  ) {
    lastIndexError = null;
  }

  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/last-index-error-clear-on-health.test.ts`

Expected: PASS — Phase 1 (transient): `t1` contains `alpha`,
`indexing-failed`, and `transient scan failure`; after the call,
`getLastIndexErrorForTesting()` returns `null`. Phase 2 (readonly literal):
`t2` contains `alpha` and `readonly database`; the flag survives with
message `"readonly database"`. Phase 3: the setter resets state cleanly.

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing. Key regression check:
`test/readonly-graceful-degradation.test.ts` at line 197 chmods the DB
0o444 → every indexing attempt fails writability → `ensureIndexed` sets
the literal `lastIndexError = new Error("readonly database")`. The new
clear-condition preserves it because the message equals the literal.

### Task 8: RC-D timestamp: indexingFailedNote emits age signal [depends: 1, 7]

Record a timestamp whenever `lastIndexError` is set, and have
`indexingFailedNote` include an age in seconds so agents can reason about
staleness. Output format:
`indexing-failed (${ageSeconds}s ago): ${lastIndexError.message}\n`.

**Files:**
- Modify: `src/index.ts`
- Create: `test/indexing-failed-note-age.test.ts`

**Step 1 — Write the failing test**

Create `test/indexing-failed-note-age.test.ts`:
```ts
import { expect, test, describe } from "bun:test";
describe("RC-D: indexingFailedNote includes an age", () => {
  test("helper renders 'indexing-failed (<N>s ago): <msg>' and preserves the prefix", async () => {
    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();
    try {
      // Inject a synthetic error record at a known wall-clock time. The
      // helper-based assertion is deterministic: Task 7's clear-on-success
      // hook lives inside `finalizeReadOnlyOutput` and does not touch the
      // note helper directly, so we can exercise the formatter in isolation.
      mod.setLastIndexErrorForTesting(new Error("transient scan failure"), 1_000);

      // `now` is 4_500 ms, `setAt` is 1_000 ms — age is floor(3500/1000) = 3s.
      const note = mod.getIndexingFailedNoteForTesting(4_500);
      expect(note).toBe("indexing-failed (3s ago): transient scan failure\n");
      // Back-compat: existing assertions that only look for the prefix must
      // keep matching the new format.
      expect(note).toContain("indexing-failed");
    } finally {
      mod.setLastIndexErrorForTesting(null);
      mod.resetStoreForTesting();
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/indexing-failed-note-age.test.ts`

Expected: FAIL — Task 7 already introduced `setLastIndexErrorForTesting(error)`
as a one-arg setter, so that call itself does not throw (the extra `1_000`
argument is silently ignored by the one-arg signature). The first failure
is the `getIndexingFailedNoteForTesting` call — that helper is new to this
task. Bun prints:
```
TypeError: mod.getIndexingFailedNoteForTesting is not a function
    at .../test/indexing-failed-note-age.test.ts
```
After scaffolding the getter but leaving the format unchanged, the
assertion changes to:
```
error: expect(received).toBe(expected)
Received: "indexing-failed: transient scan failure\n"
```
Either way, the test is red until both the extended setter and the new
getter land *and* `indexingFailedNote` delegates to the age-formatting helper.

**Step 3 — Write minimal implementation**

Edit `src/index.ts`. Replace the `lastIndexError` module variable with a
typed record that captures the time it was set. Update all three
assignment sites in `ensureIndexed` (`src/index.ts:105, 107, 110`) and
`indexingFailedNote` (`src/index.ts:115-118`).

Before (`src/index.ts:64`):
```ts
let lastIndexError: Error | null = null;
```
After:
```ts
interface IndexErrorRecord { error: Error; setAt: number }
let lastIndexError: IndexErrorRecord | null = null;
```

Update `getLastIndexErrorForTesting` at `src/index.ts:70-72` so its return
shape is stable (existing tests call `.message` on the result):

Before:
```ts
export function getLastIndexErrorForTesting(): Error | null {
  return lastIndexError;
}
```
After:
```ts
export function getLastIndexErrorForTesting(): Error | null {
  return lastIndexError ? lastIndexError.error : null;
}
```
**Extend** the test-only setter introduced in Task 7 to accept an optional
`setAt` timestamp (required by the new `IndexErrorRecord` shape), and **add** a
new `getIndexingFailedNoteForTesting` helper. Both live next to
`getLastIndexErrorForTesting` at `src/index.ts:70-72`. Task 7 shipped the
setter as `(error: Error | null) => void`; this task replaces that signature
with:

```ts
export function setLastIndexErrorForTesting(error: Error | null, setAt: number = Date.now()): void {
  lastIndexError = error ? { error, setAt } : null;
}

export function getIndexingFailedNoteForTesting(now: number = Date.now()): string {
  if (!lastIndexError) return "";
  const ageSeconds = Math.max(0, Math.floor((now - lastIndexError.setAt) / 1000));
  return `indexing-failed (${ageSeconds}s ago): ${lastIndexError.error.message}\n`;
}
```
Update `resetStoreForTesting` at `src/index.ts:77` — no structural change,
the `= null` assignment is still valid.

Update `ensureIndexed` at `src/index.ts:101-113`:

```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  try {
    const result = await indexProject(projectRoot, store);
    if (result.errors > 0 && !dbIsWritable(projectRoot)) {
      lastIndexError = { error: new Error("readonly database"), setAt: Date.now() };
    } else {
      lastIndexError = null;
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    lastIndexError = { error, setAt: Date.now() };
    // Indexing failed — degrade gracefully and serve stale graph data.
  }
}
```

Update `indexingFailedNote` at `src/index.ts:115-118` to delegate to the
shared helper so production code and the test helper use the exact same
format:

```ts
function indexingFailedNote(): string {
  return getIndexingFailedNoteForTesting();
}
```

Update `finalizeReadOnlyOutput` from Task 7. Task 7 placed the
transient-clear block **after** `indexingFailedNote()` was prepended (so
the current call's note carries the real message, while the next call
starts clean). Keep that location unchanged and dereference
`.error.message` on the new record shape:

```ts
function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
  const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
  if (
    lastIndexError &&
    lastIndexError.error.message !== "readonly database" &&
    withoutFreshHeader.trim().length > 0
  ) {
    lastIndexError = null;
  }

  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}
```

Do not move the clear-decision above `indexingFailedNote()` — that would
break Task 1's first-call assertion that the real captured message is
surfaced verbatim, and it would break Task 7's call-1 assertions that the
note is rendered on the first failing call.

**Step 4 — Run test, verify it passes**

Run: `bun test test/indexing-failed-note-age.test.ts`

Expected: PASS — `getIndexingFailedNoteForTesting(4_500)` returns
`"indexing-failed (3s ago): transient scan failure\n"` exactly, and the
same string contains the `indexing-failed` prefix.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. Specifically:
- `test/ensure-indexed-error-message.test.ts` (Task 1) still asserts
  `toContain("indexing-failed")` and `toContain("tsserver crashed")` — the
  new format keeps both substrings.
- `test/readonly-graceful-degradation.test.ts` asserts
  `toContain("indexing-failed")` — still passes; the new format starts
  with the same prefix.
- `test/last-index-error-clear-on-health.test.ts` (Task 7) calls
  `getLastIndexErrorForTesting()?.message` — still works because the
  getter returns the inner `Error`.

### Task 9: RC-E mutex: coalesce parallel ensureIndexed calls onto one in-flight promise [depends: 8]

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

### Task 10: Full-suite verification: bun test clean under full batch fix [no-test] [depends: 1, 2, 3, 4, 5, 6, 7, 8, 9]

Regression coverage for the original reproduction scenario
(parallel first-run `symbol_graph` calls with a transient LSP-stage write
fault) now lives inside Task 9's `test/ensure-indexed-mutex.test.ts` — that
is the task that introduces the mutex, so it is the correct home for the
red step.

This task is a pure suite-verification / wrap-up step and does not add any
new production code or new test file. `[no-test]` is justified because the
observable behaviour for every Fixed-When criterion is already covered by
Tasks 1–9, each of which ships with its own passing test.

**Files:**
- Modify: `.megapowers/plans/072-harden-ensureindexed-error-path-real-mes/plan.md` (update the Fixed-When checklist to point #9 at the Task 9 reset assertion)

**Verification — step 1: full test suite runs clean**

Run: `bun test`

Expected: all tests passing, including:

- `test/ensure-indexed-error-message.test.ts` (Task 1)
- `test/lsp-stage-guarded-writes.test.ts` (Tasks 2 + 3)
- `test/git-stage-guarded-writes.test.ts` (Task 4)
- `test/ast-grep-guarded-writes.test.ts` (Task 5)
- `test/pipeline-stage-error-accounting.test.ts` (Task 6)
- `test/last-index-error-clear-on-health.test.ts` (Task 7)
- `test/indexing-failed-note-age.test.ts` (Task 8)
- `test/ensure-indexed-mutex.test.ts` (Task 9, includes the explicit
  `resetStoreForTesting` reset-of-new-module-state assertion)
- `test/readonly-graceful-degradation.test.ts` (pre-existing readonly DB
  coverage)

**Verification — step 2: Fixed-When checklist**

Manually confirm every acceptance criterion from the diagnosis `Fixed When`
section is covered by a specific green test:

- Fixed When #1 → Task 1 test
- Fixed When #2 → Task 2 + Task 3 tests
- Fixed When #3 → Task 4 test
- Fixed When #4 → Task 5 tests
- Fixed When #5 → Task 6 test
- Fixed When #6 → Task 7 test
- Fixed When #7 → Task 8 test
- Fixed When #8 → Task 9 invocation-count test
- Fixed When #9 → Task 9 reset assertion: `resetStoreForTesting()` clears the new
  `indexProjectImpl` override and `indexingInFlight` state introduced by Tasks 8
  and 9 (the post-reset `expect(indexCallCount).toBe(1)` +
  `expect(secondCallCount).toBe(1)` assertions)
- Fixed When #10 → this task's full-suite run

No new files. No test-writing branch. No `git stash` / `git checkout`.
