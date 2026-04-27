---
id: 3
title: Extend NodeSignals with coverageKnown wired from store.hasCoverageData()
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/output/signals.ts
files_to_create:
  - test/output-signals-coverage-known.test.ts
---

Covers AC1 wiring + supports AC6/AC7. Adds a new `coverageKnown: boolean` field on `NodeSignals` populated from `store.hasCoverageData()`. Format functions are NOT changed in this task.

**Files:**
- Modify: `src/output/signals.ts`
- Create: `test/output-signals-coverage-known.test.ts`

**Step 1 — Write the failing test**

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { createSignalComputer } from "../src/output/signals.js";

function makeStoreWithFn() {
  const store = new SqliteGraphStore();
  store.addNode({
    id: "src/x.ts::fn:1",
    kind: "function",
    name: "fn",
    file: "src/x.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h",
    is_exported: true,
  });
  return store;
}

test("NodeSignals.coverageKnown is false when store has no coverage data", () => {
  const store = makeStoreWithFn();
  try {
    const computer = createSignalComputer(store);
    const signals = computer.compute("src/x.ts::fn:1");
    expect(signals.coverageKnown).toBe(false);
    expect(signals.tested).toBe(false);
  } finally {
    store.close();
  }
});

test("NodeSignals.coverageKnown is true when store.markCoverageIndexed() was called", () => {
  const store = makeStoreWithFn();
  try {
    store.markCoverageIndexed();
    const computer = createSignalComputer(store);
    const signals = computer.compute("src/x.ts::fn:1");
    expect(signals.coverageKnown).toBe(true);
    expect(signals.tested).toBe(false);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-signals-coverage-known.test.ts`
Expected: FAIL — `expect(received).toBe(expected) ... Expected: false Received: undefined` (the `coverageKnown` field does not yet exist on `NodeSignals`).

**Step 3 — Write minimal implementation**

In `src/output/signals.ts`:

1. Add the new field on `NodeSignals` (after `tested: boolean;`):
```ts
  coverageKnown: boolean;
```

2. Inside `createSignalComputer`, capture coverage state once per computer (it does not depend on nodeId):
```ts
  const coverageKnown = store.hasCoverageData();
```
Place this near the other top-level `const` declarations inside `createSignalComputer`.

3. In the cached `base` builder block, include `coverageKnown` in `built`:
```ts
        const built = {
          roles: sortRoles(roles, ROLE_ORDER),
          fanIn,
          fanOut,
          tested,
          frameworkMediated,
          isExported,
          coverageKnown,
        };
```

4. Update the `Omit<NodeSignals, "coChangeScore">` cache type — already correct since we only omit `coChangeScore` and now include `coverageKnown` in the base shape.

5. In the empty-node fallback (when `store.getNode(nodeId)` returns null) add `coverageKnown: false` to the returned object.

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-signals-coverage-known.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing. (Existing tests do not reference `coverageKnown`; format functions unchanged here.)
