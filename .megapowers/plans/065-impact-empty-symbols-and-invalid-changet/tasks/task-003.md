---
id: 3
title: Reject invalid changeType at impact() tool entry (Case E)
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - test/tool-impact-empty-symbols.test.ts
  - src/tools/impact.ts
files_to_create: []
---

Covers Fixed-When criterion #3 for Case E — invalid `changeType` passed to `impact()` with a resolvable symbol. Adds a defense-in-depth validChangeTypes check that lists the four valid literals in the error.

**Files:**
- Modify: `test/tool-impact-empty-symbols.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Append the following test to `test/tool-impact-empty-symbols.test.ts`:

```ts
test("impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: ["shared"],
      changeType: "typo_change" as unknown as "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("changeType");
    expect(out).toContain("signature_change");
    expect(out).toContain("removal");
    expect(out).toContain("behavior_change");
    expect(out).toContain("addition");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: FAIL — reproduction already confirmed that `impact({ symbols: ["shared"], changeType: "typo_change" })` with a seeded `shared` node returns `"## Trust\nstatus: fresh\nevidence: tree-sitter  stale-files: 0/0\n"` — no `changeType` / `signature_change` / `removal` substrings. Bun prints an assertion failure like:
```
error: expect(received).toContain(expected)
Expected substring: "changeType"
Received: "## Trust
status: fresh
evidence: tree-sitter  stale-files: 0/0
"
```

**Step 3 — Write minimal implementation**

In `src/tools/impact.ts`, add the `changeType` validation immediately after the empty-symbols guard from Tasks 1–2 and before the `for (const symbol of params.symbols)` loop. That location:

```ts
  if (!params.symbols || params.symbols.length === 0) {
    return prependTrustHeader(
      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
      { stats },
    );
  }

  for (const symbol of params.symbols) {
```

becomes:

```ts
  if (!params.symbols || params.symbols.length === 0) {
    return prependTrustHeader(
      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
      { stats },
    );
  }

  const validChangeTypes: readonly ChangeType[] = ["signature_change", "removal", "behavior_change", "addition"];
  if (!validChangeTypes.includes(params.changeType)) {
    return prependTrustHeader(
      `changeType: invalid value "${params.changeType}" — must be one of: ${validChangeTypes.join(", ")}\n`,
      { stats },
    );
  }

  for (const symbol of params.symbols) {
```

(`ChangeType` is already imported/defined at the top of the same file — see `export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";` on line 7.)

**Ordering note:** Keep the `changeType` check **before** the symbol-resolution loop (lines 140–149) and **before** the `"addition"` special-case message (lines 151–156). `"addition"` is in `validChangeTypes` so it passes this check and still reaches its existing special-case branch.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: PASS — all three Task 1/2/3 tests pass.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all tests pass. In particular, `test/tool-impact.test.ts` "collectImpact classification matrix (AC 34) across all change types" exercises all four valid literals via `collectImpact` — those go through `collectImpactDetails`, not `impact()`, so the new validation block at `impact()` does not affect them.
