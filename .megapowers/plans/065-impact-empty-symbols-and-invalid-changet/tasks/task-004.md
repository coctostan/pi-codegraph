---
id: 4
title: Short-circuit collectImpactDetails on empty/undefined symbols
  (defense-in-depth)
status: approved
depends_on:
  - 1
  - 2
  - 3
no_test: false
files_to_modify:
  - test/tool-impact-empty-symbols.test.ts
  - src/tools/impact.ts
files_to_create: []
---

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
