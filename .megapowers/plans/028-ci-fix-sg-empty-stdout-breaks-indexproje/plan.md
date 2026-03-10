# Plan

### Task 1: Regression-test indexProject against empty sg stdout

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

### Task 2: Directly regression-test runScan empty stdout at the subprocess boundary

### Task 2: Directly regression-test runScan empty stdout at the subprocess boundary

**Covers:**
- AC1 (empty-stdout branch) — `runScan()` returns `[]` when `sg` produces empty stdout for a no-match case
- AC4 (direct subprocess-boundary half) — one direct regression test covers the original broken subprocess payload

**Files:**
- Modify: `test/indexer-ast-grep-scan.test.ts`
- Test: `test/indexer-ast-grep-scan.test.ts`

**Step 1 — Write the regression test**
Append this test to `test/indexer-ast-grep-scan.test.ts`:
```ts
test("runScan returns [] when sg exits successfully with empty stdout", async () => {
  const emptyExec: ExecFn = async () => "";
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], emptyExec)).resolves.toEqual([]);
});
```
**Step 2 — Run the focused test**
Run: `bun test test/indexer-ast-grep-scan.test.ts`
Expected on the historical broken implementation (pre-fix `runScan()` with unconditional `JSON.parse(stdout)`): FAIL — `error: Invalid sg JSON output: JSON Parse error: Unexpected EOF`
Expected on current HEAD: PASS

**Step 3 — Regression-coverage implementation note**
No production-code change is expected on current HEAD for this task. Do **not** edit `src/indexer/ast-grep.ts` unless this new test exposes a real defect. The intended behavior is already implemented by the existing guard:
```ts
if (!stdout.trim()) return [];
```
**Step 4 — Re-run the focused test**
Run: `bun test test/indexer-ast-grep-scan.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Directly regression-test runScan whitespace-only stdout [depends: 2]

### Task 3: Directly regression-test runScan whitespace-only stdout [depends: 2]

**Covers:**
- AC1 (whitespace-only branch) — `runScan()` returns `[]` when `sg` produces only whitespace for a no-match case

**Files:**
- Modify: `test/indexer-ast-grep-scan.test.ts`
- Test: `test/indexer-ast-grep-scan.test.ts`

**Step 1 — Write the regression test**
Append this test to `test/indexer-ast-grep-scan.test.ts`:

```ts
test("runScan returns [] when sg stdout is whitespace-only", async () => {
  const whitespaceExec: ExecFn = async () => " \n\t ";
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], whitespaceExec)).resolves.toEqual([]);
});
```

**Step 2 — Run the focused test**
Run: `bun test test/indexer-ast-grep-scan.test.ts`
Expected on an implementation that checks only `stdout === ""` and still parses whitespace-only output: FAIL — `error: Invalid sg JSON output: JSON Parse error: Unexpected EOF`
Expected on current HEAD: PASS

**Step 3 — Regression-coverage implementation note**
No production-code change is expected on current HEAD for this task. Do **not** edit `src/indexer/ast-grep.ts` unless this new test exposes a real defect. The required behavior is the existing trim-based guard:

```ts
if (!stdout.trim()) return [];
```

**Step 4 — Re-run the focused test**
Run: `bun test test/indexer-ast-grep-scan.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Directly regression-test runScan malformed non-empty JSON [depends: 3]

### Task 4: Directly regression-test runScan malformed non-empty JSON [depends: 3]

**Covers:**
- AC2 — `runScan()` still throws for genuinely malformed non-empty JSON output

**Files:**
- Modify: `test/indexer-ast-grep-scan.test.ts`
- Test: `test/indexer-ast-grep-scan.test.ts`

**Step 1 — Write the regression test**
Append this test to `test/indexer-ast-grep-scan.test.ts`:

```ts
test("runScan still rejects malformed non-empty JSON output", async () => {
  const malformedExec: ExecFn = async () => "not-json";
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], malformedExec)).rejects.toThrow(
    'Invalid sg JSON output: JSON Parse error: Unexpected identifier "not"',
  );
});
```

**Step 2 — Run the focused test**
Run: `bun test test/indexer-ast-grep-scan.test.ts`
Expected on an over-broad normalization bug that incorrectly swallows non-empty output as a no-match case: FAIL — `Expected promise to reject, but it resolved`
Expected on current HEAD: PASS

**Step 3 — Regression-coverage implementation note**
No production-code change is expected on current HEAD for this task. Do **not** edit `src/indexer/ast-grep.ts` unless this new test exposes a real defect. The required non-empty parse-failure path is the existing logic:

```ts
let parsed: unknown;
try {
  parsed = JSON.parse(stdout);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Invalid sg JSON output: ${message}`);
}
```

**Step 4 — Re-run the focused test**
Run: `bun test test/indexer-ast-grep-scan.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
