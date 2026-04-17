## Task 4: Add symbol_graph include schema without changing default output

Step 1's exact-output assertion is wrong. `formatNeighborhood()` in `src/output/anchoring.ts` always appends signal tags computed by `createSignalComputer().compute(node.id)` — so the second body line for the unique-symbol fixture is `${anchor} [entry-point, leaf, untested]`, not `${anchor}`. The test as written will FAIL on Step 4 instead of passing.

Reasoning for those tags using the test fixture (`foo`, exported, no neighbors, no tests):
- `isExported && fanIn === 0` → `entry-point`
- `fanOut === 0` → `leaf`
- no `tested_by` edges → `untested`

Sorted with `ROLE_ORDER` (`entry-point`, `hub`, `leaf`, `framework-mediated`) → `[entry-point, leaf, untested]`.

Replace the expected-string assertion with:

```ts
const node = store.findNodes("foo")[0]!;
const anchor = computeAnchor(node, projectRoot).anchor;

const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
expect(withoutInclude).toBe(
  `## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n## foo (function)\n${anchor} [entry-point, leaf, untested]\n`,
);

const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });
expect(withEmptyInclude).toBe(withoutInclude);
```

Do not touch Step 2 / Step 3 / Step 4 / Step 5 — only fix the Step 1 expected string.

## Task 5: Append shared contract output from symbol_graph include

The success-path assertion in Step 1 is correct, but the missing-symbol assertion will FAIL on Step 4 because of the newline math in the implementation in Step 3.

### What the implementation actually produces for `doesNotExist`

In `renderSymbolContractBody()` the not-found branch returns:

```ts
return { body: `Symbol "${name}" not found`, hasLocalExceptions: false };
```

i.e. a body **without** a trailing newline. The `symbolGraph()` not-found branch in Step 3 sets:

```ts
body = `Symbol "${name}" not found`;
```

also without a trailing newline. The append block uses:

```ts
body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
```

So for the missing-symbol path, the separator is `\n\n` (because `body` does not end with `\n`), and `rendered.body` itself has no trailing newline.

After `prependTrustHeader`, that gives:

```
## Trust
status: fresh
evidence: coverage  stale-files: 0/0
Symbol "doesNotExist" not found

Symbol "doesNotExist" not found
```

`base` for the missing case is `${trust}\nSymbol "doesNotExist" not found` (no trailing `\n`). `withContract.slice(base.length)` is `\n\nSymbol "doesNotExist" not found`, **not** `\nSymbol "doesNotExist" not found`.

### Fix

Update the second test in `test/tool-symbol-graph-contract-include.test.ts` (and the matching block in `plan.md`) so the slice expectation matches the actual `\n\n` separator the implementation emits for the not-found path:

```ts
test("symbolGraph appends the standalone symbol_contract empty state when include contains contract for an unknown symbol", () => {
  const { projectRoot, store, cleanup } = setupContractFixture();
  try {
    const base = symbolGraph({ name: "doesNotExist", store, projectRoot });
    const standaloneBody = suppressFreshTrustHeader(
      symbolContractTool.symbolContract({ name: "doesNotExist", store, projectRoot }),
    );
    const withContract = symbolGraph({ name: "doesNotExist", include: ["contract"] as any, store, projectRoot });

    expect(withContract.startsWith(base)).toBe(true);
    expect(withContract.slice(base.length)).toBe(`\n\n${standaloneBody}`);
    expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);
  } finally {
    cleanup();
  }
});
```

Note the additional `## Trust` count assertion mirrors the success-path test and prevents accidentally double-rendering the trust header in the empty-state branch.

Do not change Step 2 / Step 3 / Step 4 / Step 5 — only fix the not-found test assertion. The success-path assertion (`expect(withContract.slice(base.length)).toBe(`\n${standaloneBody}`)`) is correct because `formatNeighborhood()` ends `body` with a trailing `\n`, so the implementation's `body.endsWith("\n") ? "\n" : "\n\n"` selects the single-newline separator there.
