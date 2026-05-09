## Cross-task blocker: full-suite gates still cannot pass after Task 3/4 and later output tasks

The reordering fixed the hash-initialization failure, but the plan still has an honest-`bun test` blocker.

After Task 3 changes `computeAnchor(...)` to return a bare `LINE:HASH` in `anchor.anchor`, all existing output code that still renders `anchor.anchor` directly will change from old `file:line:4hex` output to bare-only `line:3hex` output. Existing tests that assert old anchored output are not updated until later tasks, and many are not listed in any task at all. Therefore Task 3 Step 5 and Task 4 Step 5 cannot pass as written.

Concrete current tests that will fail and are not covered by the current task file lists include:

```text
test/extension-impact.test.ts:18    expect(result.anchor).toMatch(/^src\/f\.ts:1:[0-9a-f]{4}$/);
test/extension-impact.test.ts:48    expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1 .../);
test/tool-symbol-graph.test.ts:56  expect(output).toContain("src/a.ts:3:");
test/tool-symbol-graph-signals.test.ts:52 expect(out).toMatch(/src\/shared\.ts:1:[0-9a-f]{4} .../);
test/tool-symbol-card-happy.test.ts:55 expect(output).toContain("src/a.ts:3:");
test/tool-symbol-contract-happy.test.ts:59 expect(output).toContain("src/validate.ts:1:");
test/tool-impact-ambiguous.test.ts:76 expect(output).toContain("src/hash.ts:1:");
test/tool-trace-ambiguous.test.ts:48 expect(output).toContain("src/hash.ts:1:");
test/tool-trace-coverage.test.ts:49-51 expect old `src/...:line:` trace rows
test/tool-trace-signals.test.ts:56-57 expect `src/app.ts:line:4hex` trace rows
test/tool-trace-stale.test.ts:32 expect old trace rows
test/tool-trace-static-mode-header.test.ts:69 expect old trace rows
test/tool-trace-trust-heuristic.test.ts:49 expect old trace rows
```

Run this mechanical check while revising and assign every remaining stale assertion to the task that changes that output surface:

```sh
grep -R "src/.*:[0-9]:\|\[0-9a-f\]{4}\|:abcd" test/*.test.ts
```

Do not leave any old public-output assertion unassigned. Each task with `Step 5 — Run: bun test` must include all fixture/assertion updates needed for the full suite to pass immediately after that task.

## Task 3: Switch computeAnchor to bare editable anchors

Task 3 Step 5 currently says `bun test` passes after only changing `src/output/anchoring.ts` and `test/output-compute-anchor.test.ts`. That is not realistic, because changing `computeAnchor(...).anchor` immediately changes every renderer that currently prints `anchor.anchor`.

Fix Task 3 in one of these two explicit ways:

1. Preferred: restructure the task order so Task 3 does not require the full-suite gate until the directly affected renderers/tests have been updated; or
2. Expand Task 3's files/body to include every existing test that directly calls `computeAnchor(...)` and every immediately broken renderer/test fixture needed for `bun test` to pass at Task 3.

At minimum, Task 3 must include and update `test/extension-impact.test.ts` because it directly imports and calls `computeAnchor`:

```ts
import { computeAnchor } from "../src/output/anchoring.js";

// Replace the old assertion:
expect(result.anchor).toMatch(/^src\/f\.ts:1:[0-9a-f]{4}$/);

// With assertions matching the new AnchorResult contract:
expect(result.file).toBe("src/f.ts");
expect(result.anchor).toMatch(/^1:[0-9a-f]{3}$/);
expect(result.anchor).not.toContain("src/f.ts");
```

If Task 3 remains limited to only `src/output/anchoring.ts` and `test/output-compute-anchor.test.ts`, then its Step 5 must not claim `bun test` passes — but the quality bar requires the full suite gate, so the correct fix is to restructure/expand until that claim is true.

## Task 4: Initialize hash helper in extension tools

Task 4's hash-initialization implementation is plausible, but its Step 5 cannot pass while Tasks 5-9 have not yet repaired the output tests broken by Task 3.

Move Task 4 after the tasks that restore public output formatting/tests, or restructure Task 3 so the suite is already green before Task 4. Do not leave Task 4 in a position where it runs after `computeAnchor` changed but before renderers/tests are updated, because then `bun test` still fails for output-shape assertions unrelated to hash initialization.

## Task 5: Render neighborhood anchors with separate file context

Task 5 updates `test/output-format-neighborhood.test.ts`, but `formatNeighborhood(...)` is also exercised by existing symbol graph tests. Add existing symbol graph output tests that assert old `file:line:hash` neighborhood rows to this task's file list and Step 1/3 fixture updates, or otherwise assign them to the correct earlier task so Task 5 Step 5 is true.

At minimum, update these existing assertions when `formatNeighborhood(...)` changes:

```text
test/tool-symbol-graph.test.ts:56  expect(output).toContain("src/a.ts:3:");
test/tool-symbol-graph.test.ts:61  expect(output).toContain("src/b.ts:1:");
test/tool-symbol-graph.test.ts:149 expect(output).toContain("src/a.ts:3:");
test/tool-symbol-graph-signals.test.ts:52 expect(out).toMatch(/src\/shared\.ts:1:[0-9a-f]{4} .../);
test/tool-symbol-graph-signals.test.ts:53 expect(out).toMatch(/src\/helper\.ts:1:[0-9a-f]{4} .../);
```

Use the new shape, for example:

```ts
expect(output).toMatch(/src\/a\.ts  3:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/a\.ts:3:[0-9a-f]{4}/);
```

## Task 6: Render symbol-resolution candidates with separate file context

Task 6 adds a new targeted test, but existing ambiguity tests still assert old candidate rows and are not in the task file list. Add and update the existing ambiguity tests that exercise `formatAmbiguousMatches(...)` through public tools.

At minimum, include these files and replace old assertions:

```text
test/tool-impact-ambiguous.test.ts
test/tool-trace-ambiguous.test.ts
```

Replace assertions like:

```ts
expect(output).toContain("src/hash.ts:1:");
expect(output).toContain("test/hash.test.ts:1:");
```

with file-separated 3-hex assertions:

```ts
expect(output).toMatch(/src\/hash\.ts  1:[0-9a-f]{3}/);
expect(output).toMatch(/test\/hash\.test\.ts  1:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/hash\.ts:1:[0-9a-f]{4}/);
```

## Task 7: Render symbol card anchors with separate file context

Task 7 creates a new test but leaves existing card/contract tests with old assertions. Add existing tests for the same output surface to the task file list and Step 1 fixture updates.

At minimum, include and update:

```text
test/tool-symbol-card-happy.test.ts
test/tool-symbol-contract-happy.test.ts
```

Replace old assertions like:

```ts
expect(output).toContain("src/a.ts:3:");
expect(output).toContain("src/validate.ts:1:");
```

with:

```ts
expect(output).toMatch(/src\/a\.ts  3:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/a\.ts:3:[0-9a-f]{4}/);
```

and for contract output:

```ts
expect(output).toMatch(/src\/validate\.ts  1:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/validate\.ts:1:[0-9a-f]{4}/);
```

## Task 8: Render impact anchors with separate file context

Task 8 updates `test/tool-impact-output-signals.test.ts`, but `test/extension-impact.test.ts` also asserts the old impact output shape and is not currently assigned.

Add `test/extension-impact.test.ts` to Task 8's files and Step 1 updates. Replace:

```ts
expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:/);
expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]\n/);
```

with:

```ts
expect(out).toMatch(/src\/caller\.ts  2:[0-9a-f]{3}  caller  breaking  depth:1( \[stale\])?  \[fan-in:/);
expect(out).toMatch(/src\/caller\.ts  2:[0-9a-f]{3}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]\n/);
expect(out).not.toMatch(/src\/caller\.ts:2:[0-9a-f]{4}/);
```

## Task 9: Render trace anchors with separate file context

Task 9 updates only `test/tool-trace-static-fallback.test.ts`, but many existing trace tests still assert the old output shape. Add the existing trace tests to Task 9's files and Step 1 fixture updates, or split additional trace-output tasks before any full-suite gate that depends on trace output.

At minimum, include and update:

```text
test/tool-trace-coverage.test.ts
test/tool-trace-signals.test.ts
test/tool-trace-stale.test.ts
test/tool-trace-static-mode-header.test.ts
test/tool-trace-trust-heuristic.test.ts
```

Replace old assertions such as:

```ts
expect(direct).toContain("src/app.test.ts:1:");
expect(lines[2]).toContain("src/app.ts:1:");
expect(lines.some((line) => /src\/app\.ts:1:[0-9a-f]{4}  prod  function/.test(line))).toBe(true);
```

with file-separated 3-hex assertions, for example:

```ts
expect(direct).toMatch(/src\/app\.test\.ts  1:[0-9a-f]{3}/);
expect(lines[2]).toMatch(/src\/app\.ts  1:[0-9a-f]{3}/);
expect(lines.some((line) => /src\/app\.ts  1:[0-9a-f]{3}  prod  function/.test(line))).toBe(true);
expect(direct).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
```
