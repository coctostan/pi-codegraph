---
id: 2
title: Use node child_process for ast-grep subprocesses
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/ast-grep.ts
  - test/indexer-ast-grep-scan.test.ts
files_to_create: []
---

**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Modify: `test/indexer-ast-grep-scan.test.ts`

**Step 1 — Write the failing test**
Replace `test/indexer-ast-grep-scan.test.ts` with:

```ts
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

test("runScan wraps subprocess launch failures", async () => {
  const fakeExec: ExecFn = async () => {
    throw new Error("Failed to launch sg. Is ast-grep installed? spawn ENOENT");
  };
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], fakeExec)).rejects.toThrow(
    "sg invocation failed: Failed to launch sg. Is ast-grep installed? spawn ENOENT",
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
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-ast-grep-scan.test.ts`

Expected: FAIL —

```text
error: expect(received).not.toContain(expected)

Expected to not contain: "(globalThis as any).Bun"
Received: "import { spawn as nodeSpawn } from \"node:child_process\"; ..."
```

**Step 3 — Write minimal implementation**
In `src/indexer/ast-grep.ts`, replace `defaultExec` with:

```ts
async function defaultExec(cmd: string[], opts: { cwd: string }): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = nodeSpawn(cmd[0]!, cmd.slice(1), { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      reject(new Error(`Failed to launch sg. Is ast-grep installed? ${error.message}`));
    });
    child.on("close", (code) => {
      const exitCode = code ?? 0;
      // sg exits 1 when no matches found (like grep) — treat 0 and 1 as success
      if (exitCode > 1) reject(new Error(`sg failed (${exitCode}): ${stderr.trim() || stdout.trim()}`));
      else resolve(stdout);
    });
  });
}
```

Do not change `ExecFn` or `runScan` signatures.

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-ast-grep-scan.test.ts`
Expected: PASS.

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all tests pass and `tsc --noEmit` completes with no TypeScript errors.
