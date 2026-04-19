---
id: 2
title: Handle undefined symbols at impact() tool entry (Case B/C partial)
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - test/tool-impact-empty-symbols.test.ts
  - src/tools/impact.ts
files_to_create: []
---

Covers Fixed-When criterion #1/#2 for the `undefined` symbols direct-call case at the `impact()` tool boundary. Extends the regression file from Task 1 with an `undefined`-symbols test, and broadens the guard to accept `undefined`.

**Files:**
- Modify: `test/tool-impact-empty-symbols.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Append the following test to `test/tool-impact-empty-symbols.test.ts` (after the Task 1 test):

```ts
test("impact() returns Trust-header-wrapped error when symbols is undefined", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: undefined as unknown as string[],
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("symbols");
    expect(out).toContain("required");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: FAIL — Bun will emit a raw TypeError from inside `impact()` when the guard from Task 1 calls `params.symbols.length`. The failure will look like:
```
TypeError: undefined is not an object (evaluating 'params.symbols.length')
```
(Confirmed: reproduction showed the same TypeError on `for (const symbol of symbols)`; the Task 1 guard now surfaces it one line earlier, but still as a TypeError rather than a diagnostic.)

**Step 3 — Write minimal implementation**

Widen the guard in `src/tools/impact.ts` from Task 1 so both `undefined` and `[]` share the diagnostic. Replace:

```ts
  if (params.symbols.length === 0) {
```

with:

```ts
  if (!params.symbols || params.symbols.length === 0) {
```

(No other changes — the message body stays identical.)

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: PASS — both the Task 1 test and the new undefined-symbols test pass.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all tests pass.
