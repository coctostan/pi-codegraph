# Revise Instructions — Plan Iteration 2

Only Task 3 needs revision. All other tasks (1, 2, 4, 5, 6) are approved.

---

## Task 3: Prepend trust header to impact

One additional existing test file breaks that was missed in the previous revision.

### `test/tool-impact-performance.test.ts`

This test calls `impact()` with 120 dependents and checks:

```ts
const linesOut = output.trim().split("\n");
expect(linesOut).toHaveLength(120);
expect(linesOut.every((line) => line.includes("[fan-in:"))).toBe(true);
```

With the trust header, `output.trim().split("\n")` will produce 123 lines (3 header + 120 result). The `toHaveLength(120)` assertion fails. Additionally, the `.every()` check will fail because the 3 header lines don't contain `[fan-in:`.

**Fix:** Add `test/tool-impact-performance.test.ts` to `files_to_modify` in the frontmatter, and add these replacement instructions to the "Also in Step 3" section:

In `test/tool-impact-performance.test.ts`, inside the test `"impact renders 120 annotated dependents under one second"`, replace:
```ts
    const linesOut = output.trim().split("\n");
    expect(linesOut).toHaveLength(120);
    expect(linesOut.every((line) => line.includes("[fan-in:"))).toBe(true);
```
with:
```ts
    expect(output).toContain("## Trust");
    const linesOut = output.trim().split("\n");
    const resultLines = linesOut.filter((line) => line.includes("[fan-in:"));
    expect(resultLines).toHaveLength(120);
```

This preserves the intent (120 impact result rows) while accommodating the trust header.
