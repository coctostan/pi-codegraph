---
id: 5
title: Add the sg subprocess scan wrapper
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/indexer/ast-grep.ts
files_to_create:
  - test/indexer-ast-grep-scan.test.ts
---

### Task 5: Add the sg subprocess scan wrapper [depends: 4]
**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Test: `test/indexer-ast-grep-scan.test.ts`
Prerequisite: Bun runtime (project standard in `AGENTS.md`) and `sg` on PATH.

**Step 1 — Write the failing test**
```ts
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
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-scan.test.ts
```
Expected: `FAIL — Export named "runScan" not found`

**Step 3 — Implement `runScan()` with explicit command**
```ts
// src/indexer/ast-grep.ts
import { isAbsolute, relative } from "node:path";
interface RawSgMatch {
  file: string;
  range: { start: { line: number; column: number } };
  metaVariables?: {
    single?: Record<string, { text: string }>;
    multi?: Record<string, Array<{ text: string }>>;
  };
}
export interface SgMatch {
  file: string;
  line: number;
  column: number;
  metaVariables: Record<string, string | string[]>;
}

export type ExecFn = (cmd: string[], opts: { cwd: string }) => Promise<string>;
async function defaultExec(cmd: string[], opts: { cwd: string }): Promise<string> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(cmd, { cwd: opts.cwd, stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to launch sg. Is ast-grep installed? ${message}`);
  }
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`sg failed (${code}): ${stderr.trim() || stdout.trim()}`);
  return stdout;
}
// Design choice: non-zero sg exit always throws, even if stdout contains partial JSON.
function toProjectRelative(projectRoot: string, file: string): string {
  if (!isAbsolute(file)) return file;
  return relative(projectRoot, file).split("\\").join("/");
}
function normalize(projectRoot: string, raw: RawSgMatch): SgMatch {
  if (!raw.range?.start) throw new Error("Invalid sg JSON output: missing range.start");
  if (!raw.metaVariables || typeof raw.metaVariables !== "object") {
    throw new Error("Invalid sg JSON output: missing metaVariables");
  }
  const metaVariables: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw.metaVariables?.single ?? {})) metaVariables[k] = v.text;
  for (const [k, v] of Object.entries(raw.metaVariables?.multi ?? {})) metaVariables[k] = v.map((x) => x.text);
  return {
    file: toProjectRelative(projectRoot, raw.file),
    line: raw.range.start.line + 1,
    column: raw.range.start.column + 1,
    metaVariables,
  };
}

export async function runScan(projectRoot: string, rule: AstGrepRule, files: string[], execFn: ExecFn = defaultExec): Promise<SgMatch[]> {
  if (files.length === 0) return [];
  const cmd = ["sg", "run", "--json", "--lang", rule.lang, "--pattern", rule.pattern, ...files];
  let stdout: string;
  try {
    stdout = await execFn(cmd, { cwd: projectRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`sg invocation failed: ${message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid sg JSON output: ${message}`);
  }
  if (!Array.isArray(parsed)) throw new Error("Invalid sg JSON output: expected array");
  return (parsed as RawSgMatch[]).map((raw) => normalize(projectRoot, raw));
}
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-scan.test.ts
```
Expected: PASS

**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.
