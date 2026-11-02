import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkProbe, runProbes, type Probe } from "../bench/probe.js";

test("checkProbe passes output meeting every expectation", () => {
  const out = { text: "Trust: fresh\nprepare\n  getOrCreateProject\n  ensureIndexed\n", isError: false };
  expect(
    checkProbe({ all: ["prepare"], none: ["untested"], ordered: ["getOrCreateProject", "ensureIndexed"], maxChars: 100, resolves: true }, out),
  ).toEqual([]);
});

test("checkProbe names each unmet expectation", () => {
  const out = { text: "b then a, untested", isError: true };
  const failures = checkProbe({ all: ["a", "c"], none: ["untested"], ordered: ["a", "b"], maxChars: 5, resolves: true }, out);
  expect(failures).toEqual([
    "did not resolve",
    "missing: c",
    "present: untested",
    "out of order: b before a",
    "18 chars > 5",
  ]);
});

test("checkProbe reads an ordered item that never appears as missing, not out of order", () => {
  expect(checkProbe({ ordered: ["a", "z", "b"] }, { text: "a b", isError: false })).toEqual(["missing: z"]);
});

test("every probe in bench/probes.json runs on a bench task's repo at that task's pinned commit", () => {
  const benchDir = join(import.meta.dir, "..", "bench");
  const pinned = new Set(
    readdirSync(join(benchDir, "tasks")).map((f) => {
      const task = JSON.parse(readFileSync(join(benchDir, "tasks", f), "utf8"));
      return `${task.repo}@${task.commit}`;
    }),
  );
  const probes: Probe[] = JSON.parse(readFileSync(join(benchDir, "probes.json"), "utf8"));
  expect(probes.filter((p) => !pinned.has(`${p.repo}@${p.commit}`)).map((p) => p.id)).toEqual([]);
  expect(new Set(probes.map((p) => p.id)).size).toBe(probes.length);
});

test("runProbes calls the tool on an indexed worktree at the pinned commit and leaves no worktree behind", async () => {
  const reposDir = mkdtempSync(join(tmpdir(), "cg-probe-"));
  const repo = join(reposDir, "fixture");
  const git = (...args: string[]) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  try {
    mkdirSync(join(repo, "src"), { recursive: true });
    git("init", "-q");
    writeFileSync(join(repo, "src", "a.ts"), "export function alpha() {\n  return beta();\n}\nexport function beta() {\n  return 1;\n}\n");
    git("add", ".");
    git("commit", "-qm", "one");
    const commit = git("rev-parse", "HEAD");
    // A later commit drops beta: the probe must see the pinned commit, not HEAD.
    writeFileSync(join(repo, "src", "a.ts"), "export function alpha() {\n  return 2;\n}\n");
    git("commit", "-qam", "two");

    const probes: Probe[] = [
      { id: "pinned", repo: "fixture", commit, tool: "symbol_graph", params: { name: "beta" }, expect: { all: ["## beta (function)"], resolves: true } },
      { id: "miss", repo: "fixture", commit, tool: "symbol_graph", params: { name: "gamma" }, expect: { resolves: true } },
    ];
    const results = await runProbes(probes, reposDir);

    expect(results.map((r) => [r.id, r.failures])).toEqual([
      ["pinned", []],
      ["miss", ["did not resolve"]],
    ]);
    expect(git("worktree", "list").split("\n")).toHaveLength(1);
    expect(existsSync(join(repo, ".codegraph"))).toBe(false);
  } finally {
    rmSync(reposDir, { recursive: true, force: true });
  }
}, 60_000);
