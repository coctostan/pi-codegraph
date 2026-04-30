---
id: 2
title: Strip compact freshness headers
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/output/read-only-ceremony.ts
  - test/output-readonly-ceremony.test.ts
  - test/output-strip-trust-header.test.ts
files_to_create:
  - test/output-compact-freshness-ceremony.test.ts
---

### Task 2: Strip compact freshness headers [depends: 1]

**Covers:** AC 2, AC 12

**Files:**
- Modify: `src/output/read-only-ceremony.ts`
- Test: `test/output-compact-freshness-ceremony.test.ts`

**Step 1 — Write the failing tests**
Create `test/output-compact-freshness-ceremony.test.ts`:

```ts
import { expect, test } from "bun:test";

import { stripTrustHeader, suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";

test("suppressFreshTrustHeader leaves compact freshness headers untouched", () => {
  expect(suppressFreshTrustHeader("Trust: fresh\nbody\n")).toBe("Trust: fresh\nbody\n");
  expect(suppressFreshTrustHeader("Trust: partial\n- changed files: src/a.ts\nbody\n")).toBe(
    "Trust: partial\n- changed files: src/a.ts\nbody\n",
  );
});

test("stripTrustHeader removes compact freshness headers", () => {
  expect(stripTrustHeader("Trust: fresh\nbody\n")).toBe("body\n");
  expect(
    stripTrustHeader(
      "Trust: unknown\n- deleted files: src/a.ts\n- recommendation: refresh index before relying on this result\nbody\n",
    ),
  ).toBe("body\n");
});

test("stripTrustHeader still removes legacy trust blocks", () => {
  const legacy = ["## Trust", "status: stale", "evidence: tree-sitter  stale-files: 1/2", "body", ""].join("\n");
  expect(stripTrustHeader(legacy)).toBe("body\n");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-compact-freshness-ceremony.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` for `stripTrustHeader("Trust: fresh\\nbody\\n")`: Expected: `"body\\n"`; Received: `"Trust: fresh\\nbody\\n"`

**Step 3 — Write minimal implementation**
Replace `src/output/read-only-ceremony.ts` with this complete implementation. This intentionally keeps `suppressFreshTrustHeader` legacy-only so unsuppressed compact fresh output still starts with `Trust: fresh`:

```ts
function stripCompactTrustHeader(lines: string[]): string | null {
  if (!lines[0]?.startsWith("Trust: ")) return null;
  let bodyStart = 1;
  while (bodyStart < lines.length && (lines[bodyStart] ?? "").startsWith("- ")) {
    bodyStart++;
  }
  return lines.slice(bodyStart).join("\n");
}

export function suppressFreshTrustHeader(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (lines[1] !== "status: fresh") return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}

export function stripTrustHeader(text: string): string {
  const lines = text.split("\n");
  const compact = stripCompactTrustHeader(lines);
  if (compact !== null) return compact;
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (!(lines[1] ?? "").startsWith("status: ")) return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-compact-freshness-ceremony.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
