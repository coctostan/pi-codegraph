---
id: 3
title: Defensive early-exit in `collectImpactDetails` when `symbols` is
  empty/undefined
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - src/tools/impact.ts
  - test/tool-impact-empty-symbols.test.ts
files_to_create: []
---

Covers Fixed-When #4: `collectImpactDetails({ symbols: [], ... })` must return `[]` without entering the BFS. This is a defensive early-exit mirroring the `impact()` guard from Task 1, so direct callers of the helper (not just the public `impact()`) also benefit. This matches the preserved commit `bf50c633` exactly (`if (!symbols || symbols.length === 0) return [];` in `collectImpactDetails`).

**Files:**
- Modify: `test/tool-impact-empty-symbols.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Current signature (verified at `src/tools/impact.ts:66`):
```ts
export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[]
```

Where `CollectImpactParams` is defined at `src/tools/impact.ts:10–16`:
```ts
export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
  signalComputer?: SignalComputer;
}
```

Append the following to `test/tool-impact-empty-symbols.test.ts`. Note this test imports the named export `collectImpactDetails`, not `impact`. Update the top-of-file import line from `import { impact } from "../src/tools/impact.js";` to `import { collectImpactDetails, impact } from "../src/tools/impact.js";` (single import, same module).

```ts
test("collectImpactDetails() returns [] without entering BFS when symbols is empty", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    let getNeighborsCalls = 0;
    const spiedStore = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop === "getNeighbors") {
          return (...args: unknown[]) => {
            getNeighborsCalls++;
            return (target as any).getNeighbors(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const result = collectImpactDetails({
      symbols: [],
      changeType: "behavior_change",
      store: spiedStore as any,
      maxDepth: 5,
    });
    expect(result).toEqual([]);
    // BFS must not traverse on empty input — store.getNeighbors is the
    // per-step BFS traversal call at src/tools/impact.ts:89, so 0 calls
    // proves the BFS loop never entered.
    expect(getNeighborsCalls).toBe(0);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

On `main` (post-Task-1/2), `collectImpactDetails` is never reached by the `impact()` path for empty symbols, but when called directly it currently falls through to `return [...detailsByNode.values()].sort(compareDetails)` — which does return `[]`. However, the `getNeighborsCalls === 0` assertion *does* hold today because the BFS while-loop never runs on an empty queue. So this test likely passes even pre-implementation.

Run the probe before committing expected-failure text:

```bash
bun test test/tool-impact-empty-symbols.test.ts
```

Expected actual behavior: **PASS** (all 4 tests pass, including this new one), because the existing implementation already short-circuits on the empty-queue condition. If confirmed, this task becomes a **regression-lock test** rather than a failing-then-passing TDD task — we are codifying the invariant (`symbols: [] → [] without BFS`) so a future refactor that rearranges the seed/BFS loops cannot reintroduce a silent-empty path.

If the probe instead shows the test fails with e.g. `expected 0, got >0` (which would indicate some unexpected `getNeighbors` call for seeding), proceed to Step 3. Otherwise proceed to Step 3 anyway — adding the explicit early-return makes the invariant load-bearing and matches the preserved `bf50c633` diff.

**Step 3 — Write minimal implementation**

Open `src/tools/impact.ts`. Locate `collectImpactDetails` (starts at line 66). After the `const { symbols, changeType, store, maxDepth = 5, signalComputer: providedSignalComputer } = params;` destructure (line 67) and the existing `if (changeType === "addition") return [];` (line 68), add one more early-exit:

```ts
export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[] {
  const { symbols, changeType, store, maxDepth = 5, signalComputer: providedSignalComputer } = params;
  if (changeType === "addition") return [];
  if (!symbols || symbols.length === 0) return [];

  const queue: QueueItem[] = [];
  // ...rest unchanged
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: PASS — 4 pass, 0 fail.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. The early-exit is a strict superset of the existing behavior (function was already returning `[]` for empty `symbols`, just via a longer path), so no existing test can depend on the removed traversal — verified by grepping all `collectImpactDetails` callers: only `collectImpact` (line 121) and `impact` (line 158) call it in production code; in tests only `test/tool-impact-ranking.test.ts` calls it, always with non-empty `symbols`.
