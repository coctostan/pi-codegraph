---
id: 1
title: Regression-test indexProject against empty sg stdout
status: approved
depends_on: []
no_test: false
files_to_modify:
  - test/indexer-index-project.test.ts
files_to_create: []
---

### Task 1: Regression-test indexProject against empty sg stdout

**Covers:**
- AC3 — `indexProject()` continues successfully when Stage 3 receives empty stdout from `sg`
- AC4 (integration half) — one integration path confirms the indexing pipeline no longer fails

**Files:**
- Modify: `test/indexer-index-project.test.ts`
- Test: `test/indexer-index-project.test.ts`

**Step 1 — Write the regression test**
Append this test to `test/indexer-index-project.test.ts`:
```ts
test("indexProject treats empty sg stdout as a no-match Stage 3 result", async () => {
  const root = join(tmpdir(), `pi-codegraph-empty-sg-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "plain.ts"), "export function alpha() { return 1; }\n");
  const fakeClient: ITsServerClient = {
    async definition() {
      return null;
    },
    async references() {
      return [];
    },
    async implementations() {
      return [];
    },
    async shutdown() {},
  };
  const textStream = (text: string) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
  const prevSpawn = Bun.spawn;
  const store = new SqliteGraphStore(dbPath);
  try {
    (Bun as any).spawn = (cmd: string[], opts: any) => {
      if (Array.isArray(cmd) && cmd[0] === "sg") {
        return {
          stdout: textStream(""),
          stderr: textStream(""),
          exited: Promise.resolve(1),
        };
      }
      return prevSpawn(cmd as any, opts);
    };
    await expect(indexProject(root, store, { lspClientFactory: () => fakeClient })).resolves.toEqual({
      indexed: 1,
      skipped: 0,
      removed: 0,
      errors: 0,
    });
    expect(store.findNodes("alpha", "src/plain.ts")).toHaveLength(1);
  } finally {
    (Bun as any).spawn = prevSpawn;
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```
**Step 2 — Run the focused test**
Run: `bun test test/indexer-index-project.test.ts`
Expected on the historical broken implementation (pre-fix `runScan()` with no empty-stdout guard): FAIL — `error: Invalid sg JSON output: JSON Parse error: Unexpected EOF`
Expected on current HEAD: PASS

**Step 3 — Regression-coverage implementation note**
No production-code change is expected on current HEAD for this task. Do **not** edit `src/indexer/ast-grep.ts` here. This task exists to preserve integration coverage for the already-fixed behavior.

**Step 4 — Re-run the focused test**
Run: `bun test test/indexer-index-project.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
