---
id: 4
title: Directly regression-test runScan malformed non-empty JSON
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - test/indexer-ast-grep-scan.test.ts
files_to_create: []
---

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
