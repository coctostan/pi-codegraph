import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { computeLineHash, ensureHashInit } from "../src/output/anchoring.js";

// Golden vectors from pi-hashline-readmap's computeLineHash: exact line content, only a trailing CR ignored.
test("computeLineHash matches pi-hashline-readmap golden vectors", async () => {
  await ensureHashInit();

  expect(computeLineHash(1, "export function foo() {}")).toBe("cef");
  expect(computeLineHash(1, "  return 1;")).toBe("a85");
  expect(computeLineHash(1, "  return 1;\r")).toBe("a85");
  expect(computeLineHash(1, "")).toBe("d05");
});

test("computeLineHash treats whitespace as significant", async () => {
  await ensureHashInit();

  expect(computeLineHash(1, "export   function foo() {}")).not.toBe(computeLineHash(1, "export function foo() {}"));
  expect(computeLineHash(1, "   \t  ")).not.toBe(computeLineHash(1, ""));
  expect(computeLineHash(1, "  return 1;")).not.toBe(computeLineHash(1, "return 1;"));
});

const SIBLING = new URL("../../pi-hashline-readmap/src/hashline.ts", import.meta.url).pathname;

test.skipIf(!existsSync(SIBLING))("computeLineHash agrees with the sibling pi-hashline-readmap implementation", async () => {
  await ensureHashInit();
  const sibling = await import(SIBLING);
  await sibling.ensureHashInit();
  for (const line of ["export function foo() {}", "  return 1;", "\treturn  x ;\r", "", "   ", "a\tb"]) {
    expect(computeLineHash(1, line)).toBe(sibling.computeLineHash(1, line));
  }
});

test("computeLineHash fails clearly before hash initialization", async () => {
  const mod = await import(`../src/output/anchoring.js?uninit-${Date.now()}`);
  expect(() => mod.computeLineHash(1, "export function foo() {}"))
    .toThrow("Hash not initialized — call ensureHashInit() first");
});
