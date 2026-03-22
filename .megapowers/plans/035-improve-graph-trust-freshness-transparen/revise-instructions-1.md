# Revise Instructions — Plan Iteration 1

Tasks 1 and 2 are approved as-is. Tasks 3, 4, 5, and 6 each need to account for existing tests that break when the trust header is prepended to tool output.

The core issue: every task says "Step 5 — Run `bun test`, Expected: all passing" but multiple existing tests use exact `.toBe()` matching, `^` anchored regex, or `.toHaveLength()` on the tool output — so they will fail when the 3-line trust header is prepended.

Each task below lists the exact existing tests that break and what to change. Add a `files_to_modify` entry for each existing test file and include the updated assertions in the Step 3 implementation section.

---

## Task 3: Prepend trust header to impact

Two existing test files break. Add them to `files_to_modify`.

### `test/extension-impact.test.ts`

The test "impact() emits anchored structured lines and empty string for no-impact" has three breaking assertions:

```ts
// CURRENT (breaks):
expect(out.trim().split("\n")).toHaveLength(1);
expect(out).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]\n$/);
const noImpact = impact({ symbols: ["shared"], changeType: "addition", store, projectRoot, maxDepth: 3 });
expect(noImpact).toBe("");

// FIX: trust header is now always prepended, so:
// 1. Line count changes from 1 to 4 (3 header lines + 1 result line)
// 2. The output no longer starts with the anchor — check with toContain instead of ^-anchored regex
// 3. Empty impact ("addition") now returns just the trust header, not ""
expect(out.trim().split("\n").length).toBeGreaterThanOrEqual(4);
expect(out).toContain("## Trust");
expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]/);
const noImpact = impact({ symbols: ["shared"], changeType: "addition", store, projectRoot, maxDepth: 3 });
expect(noImpact).toContain("## Trust");
expect(noImpact).not.toContain("caller");
```

### `test/tool-impact-output-signals.test.ts`

Same pattern — two breaking assertions:

```ts
// CURRENT (breaks):
expect(out.trim().split("\n")).toHaveLength(1);
expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0\.00, chain-confidence:0\.80\]$/);

// FIX:
expect(out).toContain("## Trust");
expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0\.00, chain-confidence:0\.80\]/);
```

---

## Task 4: Prepend trust header to coverage-backed trace

One existing test file breaks. Add it to `files_to_modify`.

### `test/tool-trace-signals.test.ts`

```ts
// CURRENT (breaks):
expect(lines[0]).toBe("mode: coverage [stale]");

// FIX: trust header is 3 lines, mode is now on line index 3:
expect(lines[0]).toBe("## Trust");
expect(lines[3]).toBe("mode: coverage [stale]");
// The subsequent lines shift by 3 too — update the regex line checks accordingly:
expect(lines.some((line) => /src\/app\.ts:1:[0-9a-f]{4}  prod  function \[stale\] \[entry-point, tested\]/.test(line))).toBe(true);
expect(lines.some((line) => /src\/app\.ts:2:[0-9a-f]{4}  helper  function \[stale\] \[leaf, untested\]/.test(line))).toBe(true);
```

Note: the `.some()` regex checks are already index-agnostic, so they survive as-is. Only `lines[0]` needs to change.

---

## Task 5: Prepend trust header to heuristic trace

One existing test file breaks. Add it to `files_to_modify`.

### `test/tool-trace-static-mode-header.test.ts`

```ts
// CURRENT (breaks):
expect(lines[0]).toBe("mode: static (heuristic, no runtime evidence)");
expect(lines[1]).toContain("src/app.ts:1:");
expect(lines[1]).toContain("entry  function");
expect(lines).toHaveLength(4);

// FIX: 3-line trust header shifts everything. Also total length increases by 3:
expect(lines[0]).toBe("## Trust");
expect(lines[1]).toBe("status: heuristic");
expect(lines[3]).toBe("mode: static (heuristic, no runtime evidence)");
expect(lines[4]).toContain("src/app.ts:1:");
expect(lines[4]).toContain("entry  function");
expect(lines).toHaveLength(7);
```

---

## Task 6: Prepend trust header to graph_query

Two existing test files break. Add them to `files_to_modify`.

### `test/tool-graph-query-empty-query.test.ts`

```ts
// CURRENT (breaks):
expect(output).toBe("parse_error: query must not be empty\n");

// FIX:
expect(output).toContain("## Trust");
expect(output).toContain("parse_error: query must not be empty");
```

### `test/tool-graph-query-execution-error.test.ts`

This test has TWO problems:

1. Exact `.toBe()` matching breaks
2. **Runtime crash**: The `fakeStore` only mocks `queryRows()` — it doesn't implement `getStatistics()`. The new implementation calls `params.store.getStatistics(params.projectRoot)` which will throw `TypeError: fakeStore.getStatistics is not a function`.

```ts
// CURRENT (breaks):
const fakeStore = {
  queryRows() {
    throw new Error("sqlite busy");
  },
} as any;
// ...
expect(output).toBe("execution_error: failed to execute compiled query\n");

// FIX: add getStatistics to fakeStore and relax assertion:
const fakeStore = {
  queryRows() {
    throw new Error("sqlite busy");
  },
  getStatistics() {
    return { nodes: {}, edges: {}, files: { total: 0, stale: 0 } };
  },
} as any;
// ...
expect(output).toContain("## Trust");
expect(output).toContain("execution_error: failed to execute compiled query");
```

---

## Summary of Required Changes Per Task

| Task | Files to add to `files_to_modify` |
|------|-----------------------------------|
| 3 | `test/extension-impact.test.ts`, `test/tool-impact-output-signals.test.ts` |
| 4 | `test/tool-trace-signals.test.ts` |
| 5 | `test/tool-trace-static-mode-header.test.ts` |
| 6 | `test/tool-graph-query-empty-query.test.ts`, `test/tool-graph-query-execution-error.test.ts` |

Each task's Step 3 implementation should include the existing test file updates alongside the production code changes.
