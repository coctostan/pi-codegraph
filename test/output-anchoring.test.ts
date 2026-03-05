import { existsSync } from "node:fs";
import { expect, test } from "bun:test";

test("output module exports computeAnchor and rules directory exists", async () => {
  const { computeAnchor } = await import("../src/output/anchoring.js");

  expect(typeof computeAnchor).toBe("function");
  expect(existsSync("src/rules")).toBe(true);
});
