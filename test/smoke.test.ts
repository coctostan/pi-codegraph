import { describe, expect, test } from "bun:test";
// smoke test for extension entrypoint

describe("scaffold smoke", () => {
  test("src/index.ts loads and exports default function", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.default).toBe("function");
  });
});
