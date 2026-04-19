# Plan

### Task 1: Add empty-array guard at impact() tool entry (Case A)

Covers Fixed-When criterion #1 (Case A — empty array at `impact()`) and criterion #6 (minimal example in error body). Creates the regression test file scaffold that Tasks 2–4 extend, and adds the first defensive guard.

**Files:**
- Create: `test/tool-impact-empty-symbols.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Verified existing signature via `read src/tools/impact.ts symbol: impact` — current signature is:
```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string
```

Create `test/tool-impact-empty-symbols.test.ts` with content:

```ts
import { expect, test } from "bun:test";
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

test("impact() returns Trust-header-wrapped error with example when symbols is empty array", () => {
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
    expect(out).toContain("symbols");
    expect(out).toContain("required");
    // Exit-criterion #5: error body contains a minimal invocation example
    expect(out).toContain("impact({");
    expect(out).toContain("changeType");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: FAIL — Bun will print an assertion failure like:
```
error: expect(received).toContain(expected)
Expected substring: "symbols"
Received: "## Trust
status: fresh
evidence: tree-sitter  stale-files: 0/0
"
```
(Reproduction already confirmed the current output contains only the Trust header — no "symbols" substring in the body.)

**Step 3 — Write minimal implementation**

In `src/tools/impact.ts`, locate the `impact()` function (starts around line 131). Between the `getStatistics` call and the `for (const symbol of params.symbols)` loop, insert an empty-array guard. The edit should turn:

```ts
}): string {
  const stats = params.store.getStatistics(params.projectRoot);

  for (const symbol of params.symbols) {
```

into:

```ts
}): string {
  const stats = params.store.getStatistics(params.projectRoot);

  if (params.symbols.length === 0) {
    return prependTrustHeader(
      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
      { stats },
    );
  }

  for (const symbol of params.symbols) {
```

(Use `params.symbols.length === 0` — not `!params.symbols` — so Task 2 gets a real RED when it adds the `undefined` test case.)

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: PASS — the single new test passes.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all tests pass, including the existing `test/tool-impact*.test.ts` and `test/extension-impact.test.ts` files.

### Task 2: Handle undefined symbols at impact() tool entry (Case B/C partial) [depends: 1]

Covers Fixed-When criterion #1/#2 for the `undefined` symbols direct-call case at the `impact()` tool boundary. Extends the regression file from Task 1 with an `undefined`-symbols test, and broadens the guard to accept `undefined`.

**Files:**
- Modify: `test/tool-impact-empty-symbols.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Append the following test to `test/tool-impact-empty-symbols.test.ts` (after the Task 1 test):

```ts
test("impact() returns Trust-header-wrapped error when symbols is undefined", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: undefined as unknown as string[],
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("symbols");
    expect(out).toContain("required");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: FAIL — Bun will emit a raw TypeError from inside `impact()` when the guard from Task 1 calls `params.symbols.length`. The failure will look like:
```
TypeError: undefined is not an object (evaluating 'params.symbols.length')
```
(Confirmed: reproduction showed the same TypeError on `for (const symbol of symbols)`; the Task 1 guard now surfaces it one line earlier, but still as a TypeError rather than a diagnostic.)

**Step 3 — Write minimal implementation**

Widen the guard in `src/tools/impact.ts` from Task 1 so both `undefined` and `[]` share the diagnostic. Replace:

```ts
  if (params.symbols.length === 0) {
```

with:

```ts
  if (!params.symbols || params.symbols.length === 0) {
```

(No other changes — the message body stays identical.)

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: PASS — both the Task 1 test and the new undefined-symbols test pass.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all tests pass.

### Task 3: Reject invalid changeType at impact() tool entry (Case E) [depends: 1, 2]

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

### Task 4: Short-circuit collectImpactDetails on empty/undefined symbols (defense-in-depth) [depends: 1, 2, 3]

Covers Fixed-When criterion #2 — `collectImpact`/`collectImpactDetails` must not throw a raw `TypeError: undefined is not an object` when `symbols` is `undefined`, and must return a well-defined value for `[]`. Mirrors the preserved-fix design (silent short-circuit to `[]` inside the internal helper; the loud diagnostic lives at the `impact()` tool layer — Tasks 1–3). Hardens the internal helper so direct callers (`collectImpact`, future integrations) don't see a raw JS error.

**Files:**
- Modify: `test/tool-impact-empty-symbols.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Verified existing signatures via `read src/tools/impact.ts`:
```ts
export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
  signalComputer?: SignalComputer;
}
export function collectImpact(params: CollectImpactParams): ImpactItem[]
```

Append `collectImpact` import and two tests to `test/tool-impact-empty-symbols.test.ts`:

```ts
import { collectImpact } from "../src/tools/impact.js";

test("collectImpact() returns [] (not a throw) when symbols is undefined", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = collectImpact({
      symbols: undefined as unknown as string[],
      changeType: "behavior_change",
      store,
      maxDepth: 5,
    });
    expect(out).toEqual([]);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("collectImpact() returns [] when symbols is empty array", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = collectImpact({
      symbols: [],
      changeType: "behavior_change",
      store,
      maxDepth: 5,
    });
    expect(out).toEqual([]);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Adjust the import line at the top of the file from
```ts
import { impact } from "../src/tools/impact.js";
```
to
```ts
import { collectImpact, impact } from "../src/tools/impact.js";
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: FAIL — the `undefined` test throws `TypeError: undefined is not an object (evaluating 'symbols')` out of the `for (const symbol of symbols)` loop at `src/tools/impact.ts:75`. Bun will show:
```
1 | ...
TypeError: undefined is not an object (evaluating 'symbols')
      at collectImpactDetails (src/tools/impact.ts:75:...)
```
(The empty-array test will pass even without changes, since the existing silent `[]` return already satisfies `expect([]).toEqual([])`. That is fine — it documents the contract.)

**Step 3 — Write minimal implementation**

In `src/tools/impact.ts`, locate `collectImpactDetails` (starts at line 66). Just after the existing `if (changeType === "addition") return [];` guard (line 68), insert the empty/undefined short-circuit. Turn:

```ts
export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[] {
  const { symbols, changeType, store, maxDepth = 5, signalComputer: providedSignalComputer } = params;
  if (changeType === "addition") return [];

  const queue: QueueItem[] = [];
```

into:

```ts
export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[] {
  const { symbols, changeType, store, maxDepth = 5, signalComputer: providedSignalComputer } = params;
  if (changeType === "addition") return [];
  if (!symbols || symbols.length === 0) return [];

  const queue: QueueItem[] = [];
```

No other changes. `collectImpact` already delegates to `collectImpactDetails` and `.map`s — it picks up the new short-circuit automatically.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: PASS — all five tests in this file (from Tasks 1–4) pass.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all tests pass. Full suite — including `test/tool-impact.test.ts` (6 tests with populated `symbols`), `test/tool-impact-ambiguous.test.ts`, `test/tool-impact-empty-output.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-performance.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-trust-header.test.ts`, `test/extension-impact.test.ts` — should remain green. None of those tests pass empty/undefined `symbols`, so the new short-circuit is unreachable from them.

Also run: `bun run check` (tsc --noEmit) to confirm no TypeScript errors from the widened guard.

Expected: no type errors.
