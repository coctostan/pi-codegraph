---
id: 3
title: Directly regression-test runScan whitespace-only stdout
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - test/indexer-ast-grep-scan.test.ts
files_to_create: []
---

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
