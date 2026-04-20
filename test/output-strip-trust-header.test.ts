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
