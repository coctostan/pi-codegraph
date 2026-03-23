---
id: 1
title: Fix not-found symbol returning empty body in impact()
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/impact.ts
  - test/tool-impact-empty-output.test.ts
files_to_create: []
---

### Task 1: Fix not-found symbol returning empty body in impact()

**Files:**
- Modify: `src/tools/impact.ts`
- Test: `test/tool-impact-empty-output.test.ts`

**Step 1 — Write the failing test**

The failing test already exists in `test/tool-impact-empty-output.test.ts` (written during reproduction). It is the first test in the file:

```typescript
// test/tool-impact-empty-output.test.ts — first test (already exists, lines 26-45)
test("impact() returns diagnostic message for non-existent symbol (#042)", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: ["nonExistentSymbol_ZZZ"],
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    // Should contain the trust header
    expect(out).toContain("## Trust");
    // Must contain a diagnostic about the symbol not being found
    expect(out).toContain("not found");
    expect(out).toContain("nonExistentSymbol_ZZZ");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-output.test.ts -t "non-existent symbol"`

Expected: FAIL — `error: expect(received).toContain(expected)` — Expected to contain: `"not found"`, Received: `"## Trust\nstatus: fresh\nevidence: tree-sitter  stale-files: 0/0\n"`

**Step 3 — Write minimal implementation**

In `src/tools/impact.ts`, change line 148 from:

```typescript
    if (resolved.kind === "not_found") return prependTrustHeader("", { stats });
```

to:

```typescript
    if (resolved.kind === "not_found") return prependTrustHeader(resolved.text, { stats });
```

This is a one-character-class change — replace `""` with `resolved.text`. This matches the pattern used by `trace.ts:106` for the same case.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-output.test.ts -t "non-existent symbol"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing
