---
id: 3
title: Align reproduction regression test with final diagnostic/traversal behavior
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - test/tool-impact-083-repro.test.ts
files_to_create: []
---

The reproduction test `test/tool-impact-083-repro.test.ts` was written during the reproduce phase with deliberately loose expectations (regex / `toContain`) so it would flip from RED to GREEN once either fix lands. This task verifies — and, if necessary, tightens — the regression test so it asserts the full post-fix contract per Fixed-When #5 of the diagnosis.

**Files:**
- Modify: `test/tool-impact-083-repro.test.ts`

**Step 1 — Write the failing test**

Open `test/tool-impact-083-repro.test.ts` and replace the bodies of the three existing tests with tighter assertions that lock in the contract. The full new file body (retain existing `setup()` helper at lines 8-41 unchanged):

```ts
test("BUG #073: impact on an entry-point symbol returns the entry-point diagnostic", () => {
  const { projectRoot, store } = setup();
  try {
    const out = impact({
      symbols: ["entryPoint"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("No dependents found — 'entryPoint' is an entry point with no callers.");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("BUG #073 + #074: impact on an interface with implementors returns the implementor chain (not the interface diagnostic)", () => {
  const { projectRoot, store } = setup();
  try {
    const out = impact({
      symbols: ["Store"],
      changeType: "removal",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    // With #074 fixed, Store → MyStore (implements) → useStore (calls) chain is found;
    // therefore the interface *diagnostic* must NOT fire.
    expect(out).not.toContain("No call-edge dependents found for interface");
    expect(out).toContain("MyStore");
    expect(out).toContain("useStore");
    expect(out).toContain("breaking");
    expect(out).toContain("behavioral");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("BUG #074: impact on an interface traverses implements edges via collectImpact", () => {
  const { projectRoot, store } = setup();
  try {
    const hits = collectImpact({
      symbols: ["Store"],
      changeType: "signature_change",
      store,
      maxDepth: 5,
    });
    expect(hits).toEqual([
      { nodeId: "src/iface.ts::MyStore:2", name: "MyStore", file: "src/iface.ts", depth: 1, classification: "breaking" },
      { nodeId: "src/iface.ts::useStore:3", name: "useStore", file: "src/iface.ts", depth: 2, classification: "behavioral" },
    ]);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Also delete the `console.log("---...---")` instrumentation lines introduced during reproduce (they pollute test output).

**Step 2 — Run test, verify it fails**

Before Tasks 1 & 2 landed, all three assertions failed (reproduced during the reproduce phase — see `.megapowers/plans/.../reproduce.md`). If this task is executed *after* Tasks 1 and 2 are already implemented (the intended order), the old loose assertions will already pass; the tightened assertions above verify the exact contract.

Run: `bun test test/tool-impact-083-repro.test.ts`

Expected after tightening (before Tasks 1+2 implementation): FAIL — three assertion failures on the new `toContain` / `toEqual` strings.

Expected after Tasks 1+2 implementation: PASS.

**Step 3 — Write minimal implementation**

No production code changes in this task — the implementation delivered by Tasks 1 and 2 is what makes these assertions pass. The "minimal implementation" here is just the test-file update itself.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-083-repro.test.ts`

Expected: PASS — all three test cases.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. This task adds no new traversal logic; it only re-asserts the behavior that Tasks 1 and 2 established, so no other test suite should change.
