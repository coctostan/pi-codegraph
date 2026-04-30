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
