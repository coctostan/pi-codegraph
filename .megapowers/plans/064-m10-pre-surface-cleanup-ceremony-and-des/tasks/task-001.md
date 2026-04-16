---
id: 1
title: Add fresh-trust suppression helper
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/output/read-only-ceremony.ts
  - test/output-readonly-ceremony.test.ts
---

### Task 1: Add fresh-trust suppression helper

**Files:**
- Create: `src/output/read-only-ceremony.ts`
- Test: `test/output-readonly-ceremony.test.ts`

**Step 1 — Write the failing test**
Create `test/output-readonly-ceremony.test.ts` with this exact content:

```ts
import { test } from "bun:test";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";

test("suppressFreshTrustHeader strips only fresh trust headers", () => {
  const fresh = [
    "## Trust",
    "status: fresh",
    "evidence: none  stale-files: 0/0",
    "rows: 1",
    "",
  ].join("\n");

  const freshResult = suppressFreshTrustHeader(fresh);
  if (freshResult !== "rows: 1\n") {
    throw new Error(`fresh trust header was not removed: ${JSON.stringify(freshResult)}`);
  }

  for (const status of ["stale", "mixed", "heuristic", "runtime-backed"] as const) {
    const nonFresh = [
      "## Trust",
      `status: ${status}`,
      "evidence: tree-sitter  stale-files: 1/2",
      "rows: 1",
      "",
    ].join("\n");

    const result = suppressFreshTrustHeader(nonFresh);
    if (result !== nonFresh) {
      throw new Error(`non-fresh trust header was modified: ${status}`);
    }
  }

  const bodyOnly = "rows: 1\n";
  const bodyOnlyResult = suppressFreshTrustHeader(bodyOnly);
  if (bodyOnlyResult !== bodyOnly) {
    throw new Error("body without trust header was modified");
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-readonly-ceremony.test.ts`
Expected: FAIL — `Cannot find module "../src/output/read-only-ceremony.js" from "test/output-readonly-ceremony.test.ts"`

**Step 3 — Write minimal implementation**
Create `src/output/read-only-ceremony.ts` with this exact content:

```ts
export function suppressFreshTrustHeader(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (lines[1] !== "status: fresh") return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-readonly-ceremony.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing
