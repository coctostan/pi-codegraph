import { expect, test } from "bun:test";
import { getAstGrepBinary, resolveAstGrepBinary } from "../src/indexer/ast-grep-binary.js";

const pkgJson = (name: string) => (spec: string) => {
  if (spec === `${name}/package.json`) return `/pkgs/${name}/package.json`;
  throw new Error("not found");
};

test("prefers the native platform binary", () => {
  const out = resolveAstGrepBinary({
    platform: "linux",
    arch: "x64",
    resolvePackageJson: pkgJson("@ast-grep/cli-linux-x64-gnu"),
    exists: () => true,
  });
  expect(out).toBe("/pkgs/@ast-grep/cli-linux-x64-gnu/ast-grep");
});

test("uses the .exe on Windows", () => {
  const out = resolveAstGrepBinary({
    platform: "win32",
    arch: "x64",
    resolvePackageJson: pkgJson("@ast-grep/cli-win32-x64-msvc"),
    exists: () => true,
  });
  expect(out.endsWith("ast-grep.exe")).toBe(true);
});

test("falls back to the umbrella package, then to ast-grep on PATH, never bare sg", () => {
  expect(
    resolveAstGrepBinary({ platform: "linux", arch: "x64", resolvePackageJson: pkgJson("@ast-grep/cli"), exists: () => true }),
  ).toBe("/pkgs/@ast-grep/cli/ast-grep");
  expect(
    resolveAstGrepBinary({ platform: "linux", arch: "riscv64", resolvePackageJson: () => { throw new Error("none"); }, exists: () => false }),
  ).toBe("ast-grep");
});

test("the installed host resolves to a runnable ast-grep", async () => {
  const proc = Bun.spawn([getAstGrepBinary(), "--version"], { stdout: "pipe", stderr: "pipe" });
  expect(await proc.exited).toBe(0);
  expect(await new Response(proc.stdout).text()).toContain("ast-grep");
});
