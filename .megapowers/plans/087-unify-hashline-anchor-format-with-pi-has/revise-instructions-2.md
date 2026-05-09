## Task 3: Initialize hash helper in extension tools

Step 1 currently asserts `expect(text).toContain("src/foo.ts")`, but Task 3 runs before Tasks 5-7 introduce file-separated rendering. At Task 3's point in the plan, `symbolGraph` default/card output still renders only `anchor.anchor` (bare `1:c27`) and does not include `src/foo.ts` in the body or fresh Trust header. After the Step 3 implementation, the test would still fail for the wrong reason.

Replace the Task 3 test assertions with hash-initialization-only assertions:

```ts
expect(text).toContain("## foo (function)");
expect(text).toMatch(/\b1:c27\b/);
expect(text).not.toContain("Hash not initialized");
```

Do not assert `src/foo.ts` in Task 3. File path + bare anchor output is introduced and tested later in Task 7.

Step 2 can keep the expected RED as:

```md
Expected: FAIL — `Error: Hash not initialized — call ensureHashInit() first`
```

because before Task 3's implementation the extension executor reaches `computeAnchor(...)` without calling `ensureHashInit()`.

## Task 8: Render impact anchors with separate file context

Step 2's expected failure reason is inaccurate for the revised task ordering. After Task 2, `computeAnchor(...)` already returns a bare `LINE:HASH` anchor, so impact output before Task 8 will look like:

```text
2:<3hex>  caller  breaking  depth:1 ...
```

It will not still render the old `src/caller.ts:2:<4hex>` token. The positive file-separated regex is still the right RED assertion, but the failure explanation must say the file path is missing.

Replace Step 2 with:

```md
Run: `bun test test/tool-impact-output-signals.test.ts`
Expected: FAIL — `expect(received).toMatch(expected)` because the impact row renders the bare anchor without adjacent file context, e.g. `2:<3hex>  caller  breaking ...`, instead of `src/caller.ts  2:<3hex>  caller  breaking ...`.
```

Keep the negative old-shape assertion as a regression guard, but do not describe it as the expected RED source because it will already pass after Task 2.

## Task 9: Render trace anchors with separate file context

Step 2's expected failure reason is inaccurate for the revised task ordering. After Task 2, trace rows and file-scoped miss candidates use bare `LINE:HASH` anchors without file context; they do not still use `file:line:4hex` tokens.

Replace Step 2 with:

```md
Run: `bun test test/tool-trace-static-fallback.test.ts`
Expected: FAIL — `expect(received).toMatch(expected)` for `/src\/app\.ts  1:[0-9a-f]{3}  entry  function/` because the trace line renders `1:<3hex>  entry  function ...` without the adjacent `src/app.ts` file context.
```

For the file-scoped miss test, the expected pre-implementation output will similarly be `1:c27  foo (function)  src/a.ts` or bare-anchor-first output, not `src/a.ts  1:c27  foo (function)`. Keep the positive `toContain("src/a.ts  1:c27  foo (function)")` assertion; it is the RED assertion. Keep the negative old-shape assertion only as a regression guard.
