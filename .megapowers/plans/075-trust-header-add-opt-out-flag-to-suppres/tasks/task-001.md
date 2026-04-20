---
id: 1
title: Add stripTrustHeader helper to read-only-ceremony
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/output/read-only-ceremony.ts
files_to_create:
  - test/output-strip-trust-header.test.ts
---

Add a pure helper `stripTrustHeader(text: string): string` to `src/output/read-only-ceremony.ts` that removes a complete `## Trust` header block (regardless of status: fresh, stale, mixed, heuristic, runtime-backed) from the head of a string and returns the input unchanged when the head does not match that shape. Covers AC 8, AC 9.

**Files:**
- Modify: `src/output/read-only-ceremony.ts`
- Test: `test/output-strip-trust-header.test.ts` (create)

**Step 1 — Write the failing test**

Create `test/output-strip-trust-header.test.ts`:

```ts
import { expect, test } from "bun:test";
import { stripTrustHeader } from "../src/output/read-only-ceremony.js";

test("stripTrustHeader removes trust header regardless of status", () => {
  for (const status of ["fresh", "stale", "mixed", "heuristic", "runtime-backed"] as const) {
    const input = [
      "## Trust",
      `status: ${status}`,
      "evidence: tree-sitter,lsp  stale-files: 1/183",
      "body line 1",
      "body line 2",
      "",
    ].join("\n");
    const expected = ["body line 1", "body line 2", ""].join("\n");
    const actual = stripTrustHeader(input);
    expect(actual).toBe(expected);
  }
});

test("stripTrustHeader strips the trace mode line that follows the trust header when present", () => {
  const input = [
    "## Trust",
    "status: heuristic",
    "evidence: tree-sitter  stale-files: 0/1",
    "mode: static (heuristic, no runtime evidence)",
    "src/app.ts:1:abcd  entry  function",
    "",
  ].join("\n");
  const stripped = stripTrustHeader(input);
  expect(stripped.startsWith("## Trust")).toBe(false);
  expect(stripped).toContain("src/app.ts:1:abcd  entry  function");
});

test("stripTrustHeader returns input unchanged when no trust header is present", () => {
  const body = "## foo (function)\nsrc/a.ts:1:abcd\n";
  expect(stripTrustHeader(body)).toBe(body);
  expect(stripTrustHeader("")).toBe("");
});

test("stripTrustHeader is idempotent", () => {
  const input = [
    "## Trust",
    "status: stale",
    "evidence: tree-sitter  stale-files: 1/10",
    "rows: 1",
    "",
  ].join("\n");
  const once = stripTrustHeader(input);
  const twice = stripTrustHeader(once);
  expect(twice).toBe(once);
});

test("stripTrustHeader does not strip a partial/malformed trust block", () => {
  const input = ["## Trust", "status: stale", "no evidence line here", "rows: 1"].join("\n");
  expect(stripTrustHeader(input)).toBe(input);
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-strip-trust-header.test.ts`

Expected: FAIL — `SyntaxError: Export named 'stripTrustHeader' not found in module '/Users/maxwellnewman/pi/workspace/pi-codegraph/src/output/read-only-ceremony.ts'.`

(Verified by probe: `bun test` emits exactly this error when importing a non-existent named export from an existing module.)

**Step 3 — Write minimal implementation**

Edit `src/output/read-only-ceremony.ts`. Current full contents:

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

Append after the existing export:

```ts
export function stripTrustHeader(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (!(lines[1] ?? "").startsWith("status: ")) return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-strip-trust-header.test.ts`
Expected: PASS — all 5 tests pass.

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing (no existing tests import `stripTrustHeader`, and `suppressFreshTrustHeader` semantics are unchanged).
