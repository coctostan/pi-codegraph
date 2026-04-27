---
id: 6
title: formatImpactWhy renders coverage:unknown when coverage data is absent
status: approved
depends_on:
  - 3
  - 4
no_test: false
files_to_modify:
  - src/output/signals.ts
files_to_create:
  - test/output-signals-impact-why-coverage-unknown.test.ts
---

Covers AC5/AC6/AC7 for `formatImpactWhy`. The `coverage:` segment must mirror the role-tag logic:
- `coverage:tested` when `tested === true`
- `coverage:untested` when `!tested && coverageKnown`
- `coverage:unknown` when `!tested && !coverageKnown`

Depends on Task 3 (`coverageKnown`) and Task 4 (existing fixtures have already marked coverage).

**Files:**
- Modify: `src/output/signals.ts`
- Create: `test/output-signals-impact-why-coverage-unknown.test.ts`

**Step 1 — Write the failing test**

```ts
import { expect, test } from "bun:test";
import { formatImpactWhy, type NodeSignals } from "../src/output/signals.js";

const base: NodeSignals = {
  roles: ["leaf"],
  fanIn: 0,
  fanOut: 1,
  tested: false,
  frameworkMediated: false,
  isExported: false,
  coChangeScore: 0,
  coverageKnown: false,
};

test("formatImpactWhy renders coverage:unknown when coverage is not indexed", () => {
  const why = formatImpactWhy({ ...base, tested: false, coverageKnown: false }, 0.75);
  expect(why).toContain("coverage:unknown");
  expect(why).not.toContain("coverage:untested");
  expect(why).toContain("chain-confidence:0.75");
});

test("formatImpactWhy renders coverage:untested when coverage is indexed but symbol has no tested_by edge", () => {
  const why = formatImpactWhy({ ...base, tested: false, coverageKnown: true });
  expect(why).toContain("coverage:untested");
  expect(why).not.toContain("coverage:unknown");
});

test("formatImpactWhy renders coverage:tested when symbol has a tested_by edge", () => {
  const why = formatImpactWhy({ ...base, tested: true, coverageKnown: false });
  expect(why).toContain("coverage:tested");
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-signals-impact-why-coverage-unknown.test.ts`
Expected: FAIL — `expect(received).toContain(expected) ... Expected substring: "coverage:unknown" Received: "[fan-in:0, fan-out:1, roles:leaf, coverage:untested, co-change:0.00, chain-confidence:0.75]"`.

**Step 3 — Write minimal implementation**

In `src/output/signals.ts`, replace `formatImpactWhy`:

```ts
export function formatImpactWhy(signals: NodeSignals, chainConfidence?: number): string {
  const roles = sortRoles(signals.roles, IMPACT_ROLE_ORDER);
  const rolesText = roles.length > 0 ? roles.join(",") : "none";
  const chainPart = typeof chainConfidence === "number"
    ? `, chain-confidence:${chainConfidence.toFixed(2)}`
    : "";
  const coverageText = signals.tested
    ? "tested"
    : signals.coverageKnown
      ? "untested"
      : "unknown";
  return `[fan-in:${signals.fanIn}, fan-out:${signals.fanOut}, roles:${rolesText}, coverage:${coverageText}, co-change:${signals.coChangeScore.toFixed(2)}${chainPart}]`;
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-signals-impact-why-coverage-unknown.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing. Task 4 has already added `store.markCoverageIndexed()` to every existing fixture that asserts `coverage:untested`, so those assertions continue to hold.
