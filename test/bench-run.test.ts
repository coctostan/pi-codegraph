import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { armProblem, cellId, main, parseTranscript, piArgs } from "../bench/run.js";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "bench", name), "utf8");
const checkout = resolve(import.meta.dir, "..");

/** `main`'s args for a cell of a task on a repo no machine has, written to a temp dir; `main` throws before any `pi` run. */
function unrunnableCell(dir: string, ...flags: string[]): string[] {
  const task = join(dir, "task.json");
  writeFileSync(task, JSON.stringify({ id: "t", repo: "no-such-bench-repo", commit: "HEAD", question: "q", key: { all: ["x"] } }));
  return ["--task", task, "--arm", "off", "--model", "p/m", "--out", join(dir, "out"), ...flags];
}

test("main resolves a task's repo beside this checkout and leaves no temp dir when it can't add the worktree", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-run-"));
  const before = readdirSync(tmpdir()).filter((f) => f.startsWith("codegraph-bench-")).length;
  try {
    await expect(main(unrunnableCell(dir, "--provider", checkout))).rejects.toThrow(`failed in ${resolve(checkout, "..", "no-such-bench-repo")}`);
    expect(readdirSync(tmpdir()).filter((f) => f.startsWith("codegraph-bench-")).length).toBe(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseTranscript sums usage, counts turns and codegraph calls on a recorded on-arm run", () => {
  const m = parseTranscript(fixture("pilot-on-gpt.jsonl"));
  expect(m.offeredTools).toEqual(["read", "grep", "find", "ls", "bash", "symbol_graph", "impact", "trace"]);
  expect(m.turns).toBe(3);
  expect(m.tokens).toEqual({ input: 4799, output: 107, cacheRead: 1536, cacheWrite: 0, total: 6442 });
  expect(m.costUsd).toBeCloseTo(0.0108216, 7);
  expect(m.toolCalls).toEqual({ symbol_graph: 1, grep: 1 });
  expect(m.codegraphCalls).toBe(1);
  expect(m.stopReason).toBe("stop");
  expect(m.finalText).toContain("<answer>\nsrc/tools/impact.ts");
});

test("parseTranscript reads a recorded off-arm run with no codegraph tool offered", () => {
  const m = parseTranscript(fixture("pilot-off-opus.jsonl"));
  expect(m.offeredTools).toEqual(["read", "grep", "find", "ls", "bash"]);
  expect(m.turns).toBe(3);
  expect(m.tokens).toEqual({ input: 8, output: 569, cacheRead: 5757, cacheWrite: 4003, total: 10337 });
  expect(m.toolCalls).toEqual({ grep: 3 });
  expect(m.codegraphCalls).toBe(0);
  expect(m.finalText).toContain("</answer>");
});

test("parseTranscript ignores non-JSON lines and reports an empty run", () => {
  const m = parseTranscript("Warning: something\n\n");
  expect(m).toMatchObject({ offeredTools: [], turns: 0, codegraphCalls: 0, finalText: "", stopReason: null });
});

test("piArgs offers the codegraph tools on the on arm and excludes them on the off arm", () => {
  const on = piArgs({ arm: "on", model: "openai-codex/gpt-6.1-sol", prompt: "q", extensions: ["/a.ts", "/b.ts"] });
  expect(on).toContain("--no-session");
  expect(on.slice(on.indexOf("--mode"), on.indexOf("--mode") + 2)).toEqual(["--mode", "json"]);
  expect(on.filter((a, i) => on[i - 1] === "-e")).toEqual(["/a.ts", "/b.ts"]);
  expect(on).not.toContain("-xt");
  expect(on.at(-1)).toBe("q");
  const off = piArgs({ arm: "off", model: "openai-codex/gpt-6.1-sol", prompt: "q", extensions: [] });
  expect(off[off.indexOf("-xt") + 1]).toBe("symbol_graph,impact,trace");
});

test("armProblem flags a cell whose offered tools do not match its arm", () => {
  expect(armProblem("on", ["read", "symbol_graph", "impact", "trace"])).toBeNull();
  expect(armProblem("on", ["read", "symbol_graph"])).toContain("impact");
  expect(armProblem("off", ["read", "bash"])).toBeNull();
  expect(armProblem("off", ["read", "trace"])).toContain("trace");
});

test("cellId names task, arm, model and repeat in a file-safe form", () => {
  expect(cellId({ task: "t1", arm: "on", model: "anthropic-cc/claude-opus-5-5", repeat: 2 })).toBe(
    "t1__on__anthropic-cc_claude-opus-5-5__r2",
  );
});
