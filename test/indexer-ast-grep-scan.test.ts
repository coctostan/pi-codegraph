import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runScan, type AstGrepRule, type ExecFn } from "../src/indexer/ast-grep.js";

test("ast-grep indexer has no Bun runtime branches", () => {
  const source = readFileSync(join(process.cwd(), "src/indexer/ast-grep.ts"), "utf8");
  expect(source).not.toContain("(globalThis as any).Bun");
  expect(source).not.toContain("Bun.YAML");
  expect(source).not.toContain("Bun.spawn");
  expect(source).not.toContain("bun?.spawn");
  expect(source).not.toContain("bun.spawn");
});

const rule: AstGrepRule = {
  name: "express-route",
  pattern: "$APP.$METHOD($PATH, $$$HANDLERS)",
  lang: "typescript",
  produces: {
    edge_kind: "routes_to",
    from_capture: "HANDLERS",
    to_template: "endpoint:{METHOD}:{PATH}",
    confidence: 0.9,
  },
};

test("runScan uses ast-grep CLI args and normalizes --json output", async () => {
  const calls: Array<{ cmd: string[]; cwd: string }> = [];
  const fakeExec: ExecFn = async (cmd, opts) => {
    calls.push({ cmd, cwd: opts.cwd });
    return `[{"file":"src/api.ts","range":{"start":{"line":2,"column":0}},"metaVariables":{"single":{"METHOD":{"text":"get"},"PATH":{"text":"'/users'"}},"multi":{"HANDLERS":[{"text":"handler"}]}}}]`;
  };

  const matches = await runScan("/tmp/p", rule, ["src/api.ts"], fakeExec);
  expect(calls[0]!.cmd[0]).not.toBe("sg");
  expect(calls[0]!.cmd[0]).toMatch(/ast-grep(\.exe)?$/);
  expect(calls[0]!.cmd.slice(1)).toEqual([
    "run", "--json", "--lang", "typescript", "--pattern", "$APP.$METHOD($PATH, $$$HANDLERS)", "src/api.ts",
  ]);
  expect(matches).toEqual([
    {
      file: "src/api.ts",
      line: 3,
      column: 1,
      metaVariables: { METHOD: "get", PATH: "'/users'", HANDLERS: ["handler"] },
    },
  ]);
});

test("runScan wraps subprocess launch failures", async () => {
  const fakeExec: ExecFn = async () => {
    throw new Error("Failed to launch ast-grep: spawn ENOENT");
  };
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], fakeExec)).rejects.toThrow(
    "sg invocation failed: Failed to launch ast-grep: spawn ENOENT",
  );
});

test("runScan returns [] when sg exits successfully with empty stdout", async () => {
  const emptyExec: ExecFn = async () => "";
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], emptyExec)).resolves.toEqual([]);
});


test("runScan returns [] when sg stdout is whitespace-only", async () => {
  const whitespaceExec: ExecFn = async () => " \n\t ";
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], whitespaceExec)).resolves.toEqual([]);
});


test("runScan still rejects malformed non-empty JSON output", async () => {
  const malformedExec: ExecFn = async () => "not-json";
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], malformedExec)).rejects.toThrow(
    'Invalid sg JSON output: JSON Parse error: Unexpected identifier "not"',
  );
});