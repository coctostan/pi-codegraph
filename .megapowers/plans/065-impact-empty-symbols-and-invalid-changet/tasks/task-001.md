---
id: 1
title: Add symbols validation guard to impact() (empty + undefined)
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/impact.ts
files_to_create:
  - test/tool-impact-empty-symbols.test.ts
---

Covers **Fixed When #1, #2, #4 (partial), #5, #6** — the empty-array and undefined-symbols cases, both handled by a single unified guard at the `impact()` entry.

**Files:**
- Create: `test/tool-impact-empty-symbols.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Create `test/tool-impact-empty-symbols.test.ts` (this is the file name fixed by issue #65; it is also the name used in the pre-committed draft at `preserve/impact-empty-symbols-guard @ bf50c633`). The test seeds one symbol so the impact pipeline has something to walk, but the two problematic calls never reach the BFS.

The exact `impact()` signature being exercised (verified via `read src/tools/impact.ts` lines 131–137):

```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string
```

Full test file:

```ts
import { expect, test } from "bun:test";
// Regression test for impact when symbols parameter is empty or undefined (#065)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

function setupProjectWithGraph() {
  const projectRoot = join(tmpdir(), `pi-cg-impact-empty-symbols-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 1; }\n");
  const store = new SqliteGraphStore();
  store.addNode({
    id: "src/shared.ts::shared:1",
    kind: "function",
    name: "shared",
    file: "src/shared.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h",
    is_exported: true,
  });
  return { projectRoot, store };
}

test("impact() returns error message when symbols is empty array", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: [],
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("Error");
    expect(out).toContain("symbols");
    expect(out).toContain("required");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() returns error message when symbols is undefined", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: undefined as any,
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("Error");
    expect(out).toContain("symbols");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: FAIL. Two distinct failures (observed during reproduce on branch tip `59af359c`):
- `impact() returns error message when symbols is empty array` — fails on `expect(out).toContain("Error")` because the current implementation returns only the 56-char Trust header (`"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n\n"`) with no body. Bun prints: `error: expect(received).toContain(expected)` with the received Trust-only string and `Expected to contain: "Error"`.
- `impact() returns error message when symbols is undefined` — fails with an **uncaught exception** inside the test, not an assertion failure. Exact message observed in reproduce:
  ```
  TypeError: undefined is not an object (evaluating 'params.symbols')
        at impact (/Users/maxwellnewman/pi/workspace/pi-codegraph/src/tools/impact.ts:140:24)
  ```

**Step 3 — Write minimal implementation**

Modify `src/tools/impact.ts`. Add one guard immediately after the `stats` initialization and before the existing `for (const symbol of params.symbols)` loop. The single check `!params.symbols || params.symbols.length === 0` handles both failure modes.

Current shape of `impact()` (verified from `read src/tools/impact.ts` lines 131–149):

```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  const stats = params.store.getStatistics(params.projectRoot);

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
    ...
```

New shape — insert the guard between `stats` and the `for` loop:

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
  // ... rest of function unchanged
```

Notes on ordering (per diagnosis Risk Assessment):
- The guard runs **before** the symbol-resolution loop, so empty/undefined never hits `resolveUniqueSymbol` or `getNeighbors`.
- It runs **before** the `addition` short-circuit (lines 151–156). That's still correct: the existing `addition` test in `test/tool-impact-empty-output.test.ts` passes `symbols: ["shared"]` (non-empty), so this guard is a no-op for that path.
- It runs **before** any call to `collectImpactDetails`, matching the spec's requirement that the diagnostic surface reaches the formatted tool output.
- Message text contains the required tokens: `Error`, `symbols`, `required` — matching the four `expect(...).toContain(...)` assertions across both tests.

Do **not** also add `if (!symbols || symbols.length === 0) return [];` to `collectImpactDetails` in this task. It's defensive and harmless, but the diagnosis correctly notes the authoritative diagnostic must live in `impact()`; adding a second silent-empty early return in `collectImpactDetails` is unnecessary once the `impact()` guard exists and risks masking future callers.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: PASS. Both tests in this file pass (the invalid-changeType test is added in Task 2 — it's not in this file yet).

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. Specifically, these impact-adjacent test files must stay green (all verified during diagnosis to use non-empty `symbols`, so the new guard cannot affect them): `test/tool-impact.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-empty-output.test.ts`, `test/tool-impact-ambiguous.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-performance.test.ts`, `test/tool-impact-trust-header.test.ts`, `test/extension-impact.test.ts`, `test/token-tracker-all-tools.test.ts`.
