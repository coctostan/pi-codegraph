---
id: 5
title: formatRoleTags renders coverage-unknown when coverage data is absent
status: approved
depends_on:
  - 3
  - 4
no_test: false
files_to_modify:
  - src/output/signals.ts
files_to_create:
  - test/output-signals-format-coverage-unknown.test.ts
---

Covers AC5/AC6/AC7 for `formatRoleTags`. The trailing coverage token must become:
- `tested` when `signals.tested === true`
- `untested` when `signals.tested === false && signals.coverageKnown === true`
- `coverage-unknown` when `signals.tested === false && signals.coverageKnown === false`

Depends on Task 3 (adds `coverageKnown` to `NodeSignals`) and Task 4 (every existing manually-built-store fixture has already called `store.markCoverageIndexed()`, so its `untested` assertions still hold after this change).

**Files:**
- Modify: `src/output/signals.ts`
- Create: `test/output-signals-format-coverage-unknown.test.ts`

**Step 1 — Write the failing test**

```ts
import { expect, test } from "bun:test";
import { formatRoleTags, type NodeSignals } from "../src/output/signals.js";

const base: NodeSignals = {
  roles: ["leaf"],
  fanIn: 0,
  fanOut: 0,
  tested: false,
  frameworkMediated: false,
  isExported: false,
  coChangeScore: 0,
  coverageKnown: false,
};

test("formatRoleTags emits coverage-unknown when coverage is not indexed", () => {
  expect(formatRoleTags({ ...base, tested: false, coverageKnown: false })).toBe(
    "[leaf, coverage-unknown]",
  );
});

test("formatRoleTags emits untested when coverage is indexed but symbol has no tested_by edge", () => {
  expect(formatRoleTags({ ...base, tested: false, coverageKnown: true })).toBe(
    "[leaf, untested]",
  );
});

test("formatRoleTags emits tested when symbol has a tested_by edge regardless of coverageKnown", () => {
  expect(formatRoleTags({ ...base, tested: true, coverageKnown: false })).toBe(
    "[leaf, tested]",
  );
  expect(formatRoleTags({ ...base, tested: true, coverageKnown: true })).toBe(
    "[leaf, tested]",
  );
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-signals-format-coverage-unknown.test.ts`
Expected: FAIL — `Expected: "[leaf, coverage-unknown]" Received: "[leaf, untested]"` (current `formatRoleTags` always emits `untested` when `tested === false`).

**Step 3 — Write minimal implementation**

In `src/output/signals.ts`, replace `formatRoleTags`:

```ts
export function formatRoleTags(signals: NodeSignals): string {
  const coverageTag = signals.tested
    ? "tested"
    : signals.coverageKnown
      ? "untested"
      : "coverage-unknown";
  const tags = [...sortRoles(signals.roles, ROLE_ORDER), coverageTag];
  return `[${tags.join(", ")}]`;
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-signals-format-coverage-unknown.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing. Task 4 has already added `store.markCoverageIndexed()` to every existing fixture that asserts `untested`, so those assertions continue to hold.
