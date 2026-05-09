import { expect, test } from "bun:test";
import { computeLineHash, ensureHashInit } from "../src/output/anchoring.js";

test("computeLineHash matches pi-hashline-readmap golden vectors", async () => {
  await ensureHashInit();

  expect(computeLineHash(1, "export function foo() {}" )).toBe("c27");
  expect(computeLineHash(1, "export   function foo() {}")).toBe("c27");
  expect(computeLineHash(1, "  return 1;")).toBe("0da");
  expect(computeLineHash(1, "  return 1;\r")).toBe("0da");
  expect(computeLineHash(1, "")).toBe("d05");
  expect(computeLineHash(1, "   \t  ")).toBe("d05");
});

test("computeLineHash fails clearly before hash initialization", async () => {
  const mod = await import(`../src/output/anchoring.js?uninit-${Date.now()}`);
  expect(() => mod.computeLineHash(1, "export function foo() {}"))
    .toThrow("Hash not initialized — call ensureHashInit() first");
});
