import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("tsc --noEmit passes with no type errors", () => {
  const result = spawnSync("bun", ["run", "check"], { encoding: "utf8" });
  expect(result.stdout + result.stderr).not.toContain("error TS");
  expect(result.status).toBe(0);
});
