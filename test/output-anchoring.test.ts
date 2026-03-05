import { existsSync } from "node:fs";
import { expect, test } from "bun:test";

test("output module exports anchorResults and rules directory exists", async () => {
  const { anchorResults } = await import("../src/output/anchoring.js");

  expect(typeof anchorResults).toBe("function");
  expect(existsSync("src/rules")).toBe(true);
});
