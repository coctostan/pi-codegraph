---
id: 2
title: Directly regression-test runScan empty stdout at the subprocess boundary
status: approved
depends_on: []
no_test: false
files_to_modify:
  - test/indexer-ast-grep-scan.test.ts
files_to_create: []
---

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
