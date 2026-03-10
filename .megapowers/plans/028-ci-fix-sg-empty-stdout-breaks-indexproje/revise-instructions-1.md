## Task 1: Regression-test indexProject against empty sg stdout

Keep this task focused on the integration path (`indexProject()` continues when Stage 3 gets empty stdout). The Step 1 test body is realistic for the current codebase and matches existing imports in `test/indexer-index-project.test.ts`.

Required changes:

1. **Do not modify `src/indexer/ast-grep.ts` in this task.**
   The current checkout already contains the production fix at `src/indexer/ast-grep.ts:151-152`:
   ```ts
   // sg outputs empty string (not "[]") when no matches found — treat as empty result
   if (!stdout.trim()) return [];
   ```
   Your current Step 3 replacement:
   ```ts
   if (stdout === "") return [];
   ```
   would **regress** whitespace-only handling and make the code worse than current HEAD.

2. **Update the task metadata.**
   Remove `src/indexer/ast-grep.ts` from `files_to_modify`. This task should only modify:
   - `test/indexer-index-project.test.ts`

3. **Fix Step 2 / Step 3 so they match the actual codebase state.**
   On the current checkout, the new integration test should already pass because the fix is present. Do not claim the expected failing output is:
   ```text
   error: Invalid sg JSON output: JSON Parse error: Unexpected EOF
   ```
   That failure is historical, not current.

4. **Add explicit acceptance-criteria coverage to the task header/body.**
   Call out that this task covers:
   - AC3: `indexProject()` continues successfully when Stage 3 receives empty stdout
   - AC4 (integration half): one integration path confirms the pipeline no longer fails

If your workflow format requires a Step 3, make it explicit that this is a **regression-coverage-only task** and that no production-code change is expected unless the new test exposes a real defect.

## Task 2: Normalize whitespace-only sg output without masking malformed JSON

This task needs to be reworked substantially.

### Problem 1: It bundles multiple behaviors in one test
Your current Step 1 test covers both:
- whitespace-only stdout returns `[]`
- malformed non-empty JSON still throws

That violates the granularity rule for this review. Split these into separate tasks/tests.

### Problem 2: It duplicates already-correct production code
Your Step 3 replacement is effectively the same as the current `runScan()` implementation in `src/indexer/ast-grep.ts:136-162`. Do not ask the implementer to replace the function with code that is already there.

### Problem 3: It misses explicit direct coverage of the original empty-stdout bug
The acceptance criteria require a subprocess-boundary regression test. The original bug was specifically `stdout === ""` from `sg`. Add a direct `runScan()` test for that exact case.

Replace the current Task 2 with **separate tasks** using `test/indexer-ast-grep-scan.test.ts` only:

### New direct-boundary task: empty stdout returns []
Use the existing imports and `rule` constant already present in `test/indexer-ast-grep-scan.test.ts`.

```ts
test("runScan returns [] when sg exits successfully with empty stdout", async () => {
  const emptyExec: ExecFn = async () => "";
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], emptyExec)).resolves.toEqual([]);
});
```

Mark this task as covering:
- AC1 (empty stdout branch)
- AC4 (direct subprocess-boundary regression for the original bug)

### New direct-boundary task: whitespace-only stdout returns []
```ts
test("runScan returns [] when sg stdout is whitespace-only", async () => {
  const whitespaceExec: ExecFn = async () => " \n\t ";
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], whitespaceExec)).resolves.toEqual([]);
});
```

Mark this task as covering:
- AC1 (whitespace-only branch)

### New direct-boundary task: malformed non-empty JSON still throws
```ts
test("runScan still rejects malformed non-empty JSON output", async () => {
  const malformedExec: ExecFn = async () => "not-json";
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], malformedExec)).rejects.toThrow(
    'Invalid sg JSON output: JSON Parse error: Unexpected identifier "not"',
  );
});
```

Mark this task as covering:
- AC2

For all of these direct-boundary tasks:
- `files_to_modify` should be only `test/indexer-ast-grep-scan.test.ts`
- `src/indexer/ast-grep.ts` should **not** be listed unless a newly added test proves a real defect
- Step 2 should not claim a guaranteed RED on current HEAD, because the implementation is already fixed

## Plan-wide fixes required

1. **Add explicit AC coverage to each task.** The review criteria require each task to say which acceptance criteria it covers.
2. **Do not instruct the implementer to replace `runScan()` with weaker or duplicate code.** Current HEAD already has the correct guard.
3. **Ensure the final revised plan has separate tasks for:**
   - direct empty-stdout regression at `runScan()` boundary
   - direct whitespace-only regression at `runScan()` boundary
   - direct malformed-JSON regression at `runScan()` boundary
   - integration regression for `indexProject()` with empty `sg` stdout
