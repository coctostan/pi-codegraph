# Plan

### Task 1: Add symbols validation guard to impact() (empty + undefined)

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

### Task 2: Add changeType validation guard to impact() [depends: 1]

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
