import { expect, test } from "bun:test";
import { computeLineHash } from "../src/output/anchoring.js";

test("direct unit tests preload hash initialization before synchronous line hashing", () => {
  expect(computeLineHash(1, "export function foo() {}")).toBe("c27");
});
