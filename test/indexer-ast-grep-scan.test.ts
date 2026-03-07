import { expect, test } from "bun:test";
import { runScan, type AstGrepRule, type ExecFn } from "../src/indexer/ast-grep.js";

test("Bun.spawn exists in this runtime", () => {
  expect(typeof Bun.spawn).toBe("function");
});

test("Bun.spawn process contract exposes stdout/stderr/exited used by defaultExec", async () => {
  const proc = Bun.spawn(["echo", "ok"], { stdout: "pipe", stderr: "pipe" });
  expect(proc.stdout).toBeDefined();
  expect(proc.stderr).toBeDefined();
  const code = await proc.exited;
  expect(typeof code).toBe("number");
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

test("runScan uses sg CLI args and normalizes --json output", async () => {
  const calls: Array<{ cmd: string[]; cwd: string }> = [];
  const fakeExec: ExecFn = async (cmd, opts) => {
    calls.push({ cmd, cwd: opts.cwd });
    return `[{"file":"src/api.ts","range":{"start":{"line":2,"column":0}},"metaVariables":{"single":{"METHOD":{"text":"get"},"PATH":{"text":"'/users'"}},"multi":{"HANDLERS":[{"text":"handler"}]}}}]`;
  };

  const matches = await runScan("/tmp/p", rule, ["src/api.ts"], fakeExec);
  expect(calls[0]!.cmd).toEqual([
    "sg", "run", "--json", "--lang", "typescript", "--pattern", "$APP.$METHOD($PATH, $$$HANDLERS)", "src/api.ts",
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

test("defaultExec launch failure path is wrapped with actionable sg message", async () => {
  const prev = Bun.spawn;
  try {
    (Bun as any).spawn = () => {
      throw new Error("spawn ENOENT");
    };
    await expect(runScan("/tmp/p", rule, ["src/api.ts"])).rejects.toThrow("sg invocation failed: Failed to launch sg. Is ast-grep installed?");
  } finally {
    (Bun as any).spawn = prev;
  }
});

test("runScan wraps subprocess launch failures", async () => {
  const fakeExec: ExecFn = async () => {
    throw new Error("Failed to launch sg. Is ast-grep installed? spawn ENOENT");
  };
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], fakeExec)).rejects.toThrow(
    "sg invocation failed: Failed to launch sg. Is ast-grep installed? spawn ENOENT",
  );
});
