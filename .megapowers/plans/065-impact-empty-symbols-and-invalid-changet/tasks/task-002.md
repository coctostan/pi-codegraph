---
id: 2
title: Add changeType validation guard to impact()
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/impact.ts
  - test/tool-impact-empty-symbols.test.ts
files_to_create: []
---

Covers **Fixed When #3, #4 (remaining case), #5, #6** — the invalid-`changeType` case.

**Files:**
- Modify: `src/tools/impact.ts`
- Modify: `test/tool-impact-empty-symbols.test.ts` (append the third test case; the file was created in Task 1)

**Step 1 — Write the failing test**

Append this third test to `test/tool-impact-empty-symbols.test.ts` (alongside the two tests written in Task 1 — the imports, `setupProjectWithGraph` helper, and existing tests are already present; add only the new `test(...)` block at the bottom):

```ts
test("impact() returns error message for invalid changeType", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: ["shared"],
      changeType: "invalid_type" as any,
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("Error");
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

The four `toContain(...)` calls for the literal values cover Fixed When #3's requirement that the message "lists the four valid literals". The canonical list comes from `ChangeType` at `src/tools/impact.ts:7`:

```ts
export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: FAIL — the new `impact() returns error message for invalid changeType` test fails on the first unmet assertion, which is `expect(out).toContain("Error")`. The current `impact()` (with Task 1 already applied but no `changeType` guard yet) walks past the empty-symbols guard (symbols is non-empty), past `resolveUniqueSymbol` (resolves to the seeded `shared` node), past the `addition` short-circuit (changeType is not `"addition"`), into `collectImpactDetails` where `classify("invalid_type", depth)` returns `null` for every neighbor, yielding zero hits. Line 166 then returns `prependTrustHeader("", { stats })` — the same 56-char Trust-only output observed in reproduce. Bun will print:

```
error: expect(received).toContain(expected)
Expected to contain: "Error"
Received: "## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n\n"
```

The two tests from Task 1 continue to pass in this run.

**Step 3 — Write minimal implementation**

Modify `src/tools/impact.ts`. Add a second guard immediately after the Task 1 guard, before the existing symbol-resolution loop. Keep the Task 1 guard first so empty/undefined `symbols` is still the first thing diagnosed (no dependency on having a valid `changeType`).

The `ChangeType` union already exists at line 7; reuse it to keep the error message in sync with the source of truth:

```ts
export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
```

New shape of the top of `impact()` after both tasks (verified by reading `src/tools/impact.ts` lines 131–149 and accounting for Task 1's guard):

```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  const stats = params.store.getStatistics(params.projectRoot);

  // Defensive: validate symbols parameter (#065)
  if (!params.symbols || params.symbols.length === 0) {
    return prependTrustHeader(
      "Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n",
      { stats },
    );
  }

  // Defensive: validate changeType (#065)
  const validChangeTypes: ChangeType[] = ["signature_change", "removal", "behavior_change", "addition"];
  if (!validChangeTypes.includes(params.changeType)) {
    return prependTrustHeader(
      `Error: Invalid changeType "${params.changeType}". Must be one of: ${validChangeTypes.join(", ")}\n`,
      { stats },
    );
  }

  for (const symbol of params.symbols) {
    const resolved = resolveUniqueSymbol({
      name: symbol,
      store: params.store,
      projectRoot: params.projectRoot,
      notFoundLabel: "Symbol",
    });
    if (resolved.kind === "ambiguous") return prependTrustHeader(resolved.text, { stats });
    if (resolved.kind === "not_found") return prependTrustHeader(resolved.text, { stats });
  }

  if (params.changeType === "addition") {
    // ... existing addition branch unchanged
```

Why this ordering is safe (per diagnosis Risk Assessment):
- Guards run before `resolveUniqueSymbol` and `collectImpactDetails`, so invalid inputs cannot produce silent-empty output.
- Guards run before the `addition` short-circuit. That branch still works identically for valid `changeType: "addition"` (which is in `validChangeTypes`).
- Message tokens: `Error`, `changeType`, and all four literal values `signature_change` / `removal` / `behavior_change` / `addition` are present via the interpolated `${validChangeTypes.join(", ")}`.
- No change to the `ChangeType` type at line 7 — the new array just enumerates it at runtime for the diagnostic message. If the type ever grows, TypeScript will flag a mismatch between the runtime array and the union literal (since the array is typed `ChangeType[]`).

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: PASS. All three tests in the file pass (empty from Task 1, undefined from Task 1, invalid changeType from this task).

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. Beyond the impact-adjacent files listed in Task 1, pay special attention to the `addition`-branch regression test `impact() returns diagnostic message for addition change type (#043)` in `test/tool-impact-empty-output.test.ts:48-70` — it passes `changeType: "addition"`, which is in `validChangeTypes`, so the new guard is a no-op for it and the existing "addition analysis for additions is not yet supported" diagnostic still fires.
