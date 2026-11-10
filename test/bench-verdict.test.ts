import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cellId, type Arm, type Task } from "../bench/run.js";
import { auditCells, decide, type Thresholds } from "../bench/verdict.js";

const thresholds: Thresholds = { models: ["p/a", "p/b"], repeats: 1, minCut: 0.25, keepWinFraction: 0.5 };
const tasks: Task[] = ["t1", "t2"].map((id) => ({
  id,
  repo: "r",
  commit: `c-${id}`,
  question: "q",
  key: { all: ["yes"], none: ["no"] },
}));

/** A valid graded cell; `opts` sets its metrics and whether its answer is correct. */
function cell(task: Task, arm: Arm, model: string, repeat: number, opts: { tokens?: number; turns?: number; correct?: boolean } = {}) {
  const correct = opts.correct ?? true;
  const finalText = `<answer>\n${correct ? "yes" : "no"}\n</answer>`;
  return {
    cell: cellId({ task: task.id, arm, model, repeat }),
    task: task.id,
    repo: task.repo,
    commit: task.commit,
    arm,
    model,
    repeat,
    exitCode: 0,
    piVersion: "1.0.0",
    index: arm === "on" ? { indexed: 10, errors: 0 } : null,
    offeredTools: arm === "on" ? ["read", "symbol_graph", "impact", "trace"] : ["read"],
    turns: opts.turns ?? 4,
    tokens: { total: opts.tokens ?? 1000 },
    codegraphCalls: arm === "on" ? 1 : 0,
    finalText,
    grade: { correct, answer: correct ? "yes" : "no", missing: correct ? [] : ["yes"], unexpected: correct ? [] : ["no"] },
  };
}

type CellObj = ReturnType<typeof cell>;

/** Every expected cell, all correct at 1000 tokens and 4 turns, keyed by file name. */
function fullSet(edit: (c: CellObj) => CellObj = (c) => c): Map<string, string> {
  const files = new Map<string, string>();
  for (const t of tasks) {
    for (const arm of ["on", "off"] as Arm[]) {
      for (const model of thresholds.models) {
        const c = edit(cell(t, arm, model, 1));
        files.set(`${cellId({ task: t.id, arm, model, repeat: 1 })}.json`, JSON.stringify(c));
      }
    }
  }
  return files;
}

const parsed = (files: Map<string, string>) => [...files.values()].map((s) => JSON.parse(s));

test("auditCells passes the full set of well-formed cells", () => {
  expect(auditCells(tasks, thresholds, fullSet())).toEqual([]);
});

test("auditCells names a missing cell and an unexpected one", () => {
  const files = fullSet();
  const gone = `${cellId({ task: "t1", arm: "off", model: "p/b", repeat: 1 })}.json`;
  files.delete(gone);
  files.set("t1__on__p_a__r2.json", files.get("t1__on__p_a__r1.json")!);
  const problems = auditCells(tasks, thresholds, files);
  expect(problems).toHaveLength(2);
  expect(problems.join("\n")).toContain(`${gone}: missing`);
  expect(problems.join("\n")).toContain("t1__on__p_a__r2.json: unexpected");
});

test("auditCells rejects an unparseable cell and one missing a metric", () => {
  const files = fullSet();
  files.set("t1__on__p_a__r1.json", "{not json");
  const noTokens = JSON.parse(files.get("t2__off__p_b__r1.json")!);
  delete noTokens.tokens;
  files.set("t2__off__p_b__r1.json", JSON.stringify(noTokens));
  const problems = auditCells(tasks, thresholds, files).join("\n");
  expect(problems).toContain("t1__on__p_a__r1.json: malformed");
  expect(problems).toContain("t2__off__p_b__r1.json: malformed");
});

test("auditCells rejects a negative or fractional metric and a non-string offered tool", () => {
  const files = fullSet((c) => {
    if (c.task !== "t1") return c;
    if (c.arm === "on") return c.model === "p/a" ? { ...c, tokens: { total: -100 } } : { ...c, turns: 2.5 };
    return c.model === "p/a" ? { ...c, offeredTools: ["read", null as unknown as string] } : c;
  });
  const problems = auditCells(tasks, thresholds, files);
  expect(problems).toHaveLength(3);
  for (const id of ["t1__on__p_a__r1", "t1__on__p_b__r1", "t1__off__p_a__r1"]) expect(problems.join("\n")).toContain(`${id}.json: malformed`);
});

test("auditCells rejects a cell whose identity disagrees with its file name or task", () => {
  const files = fullSet((c) => (c.task === "t2" && c.arm === "on" && c.model === "p/a" ? { ...c, commit: "other" } : c));
  expect(auditCells(tasks, thresholds, files)).toEqual(["t2__on__p_a__r1.json: commit is other, expected c-t2"]);
});

test("auditCells rejects mis-armed cells: an on arm not offered the tools, an off arm offered or calling them", () => {
  const files = fullSet((c) => {
    if (c.task !== "t1" || c.model !== "p/a") return c;
    return c.arm === "on" ? { ...c, offeredTools: ["read", "trace"] } : { ...c, codegraphCalls: 2 };
  });
  const problems = auditCells(tasks, thresholds, files).join("\n");
  expect(problems).toContain("t1__on__p_a__r1.json: on arm not offered: symbol_graph, impact");
  expect(problems).toContain("t1__off__p_a__r1.json: off arm made 2 codegraph calls");
  const offered = fullSet((c) => (c.task === "t2" && c.arm === "off" && c.model === "p/b" ? { ...c, offeredTools: ["read", "impact"] } : c));
  expect(auditCells(tasks, thresholds, offered)).toEqual(["t2__off__p_b__r1.json: off arm offered: impact"]);
});

test("auditCells rejects an on-arm cell with index errors or no index, and a failed pi run", () => {
  const files = fullSet((c) => {
    if (c.task !== "t1" || c.arm !== "on") return c;
    return c.model === "p/a" ? { ...c, index: { indexed: 10, errors: 3 } } : { ...c, index: null };
  });
  const problems = auditCells(tasks, thresholds, files).join("\n");
  expect(problems).toContain("t1__on__p_a__r1.json: indexing reported 3 errors");
  expect(problems).toContain("t1__on__p_b__r1.json: on arm has no index");
  const failed = fullSet((c) => (c.task === "t2" && c.arm === "off" && c.model === "p/a" ? { ...c, exitCode: 1 } : c));
  expect(auditCells(tasks, thresholds, failed)).toEqual(["t2__off__p_a__r1.json: pi exited 1"]);
});

test("auditCells rejects a recorded grade that its task's key no longer gives", () => {
  const files = fullSet((c) => (c.task === "t1" && c.arm === "off" && c.model === "p/b" ? { ...c, finalText: "<answer>no</answer>" } : c));
  expect(auditCells(tasks, thresholds, files)).toEqual(["t1__off__p_b__r1.json: recorded grade correct=true, key gives false"]);
});

test("auditCells names a piVersion mismatch between the arms, and needs a piVersion on every cell", () => {
  const files = fullSet((c) => (c.arm === "on" ? { ...c, piVersion: "2.0.0" } : c));
  expect(auditCells(tasks, thresholds, files)).toEqual(["piVersion mismatch: on arm 2.0.0, off arm 1.0.0"]);
  const unversioned = fullSet((c) => (c.task === "t1" && c.arm === "off" && c.model === "p/a" ? { ...c, piVersion: undefined as unknown as string } : c));
  expect(auditCells(tasks, thresholds, unversioned).join("\n")).toContain("t1__off__p_a__r1.json: malformed");
});

test("auditCells names a providerCommit mismatch across or within the arms, a missing one counting as a value of its own", () => {
  const unpinned = fullSet();
  expect(auditCells(tasks, thresholds, unpinned)).toEqual([]);
  const pinned = fullSet((c) => ({ ...c, providerCommit: "abc" }));
  expect(auditCells(tasks, thresholds, pinned)).toEqual([]);
  const across = fullSet((c) => ({ ...c, providerCommit: c.arm === "on" ? "def" : "abc" }));
  expect(auditCells(tasks, thresholds, across)).toEqual(["providerCommit mismatch: on arm def, off arm abc"]);
  const within = fullSet((c) => ({ ...c, providerCommit: c.arm === "on" && c.model === "p/b" ? "def" : "abc" }));
  expect(auditCells(tasks, thresholds, within)).toEqual(["providerCommit mismatch: on arm abc/def, off arm abc"]);
  const missing = fullSet((c) => (c.task === "t1" && c.arm === "off" && c.model === "p/a" ? c : { ...c, providerCommit: "abc" }));
  expect(auditCells(tasks, thresholds, missing)).toEqual(["providerCommit mismatch: on arm abc, off arm abc/none"]);
});

test("decide keeps when the on arm wins half the pairs without losing correctness", () => {
  const cells = parsed(fullSet((c) => (c.task === "t1" && c.arm === "on" ? { ...c, tokens: { total: 750 } } : c)));
  const d = decide(tasks, thresholds, cells);
  expect(d.verdict).toBe("keep");
  expect(d.wins).toBe(2);
  expect(d.perPair.map((p) => `${p.task} ${p.model} ${p.win}`)).toEqual(["t1 p/a true", "t1 p/b true", "t2 p/a false", "t2 p/b false"]);
  expect(d.perPair[0]).toMatchObject({ correctOn: 1, correctOff: 1, tokensOn: 750, tokensOff: 1000, tokensCut: 0.25, picks: 1, onCells: 1 });
});

test("decide judges each model apart where pooling would hide a pair's win", () => {
  // p/a halves its turns on t2 and p/b doubles them: the pooled median (5 vs 4) loses; per pair, p/a wins.
  const cells = parsed(fullSet((c) => (c.task === "t2" && c.arm === "on" ? { ...c, turns: c.model === "p/a" ? 2 : 8 } : c)));
  const d = decide(tasks, thresholds, cells);
  expect(d.perPair.filter((p) => p.task === "t2").map((p) => [p.model, p.turnsCut, p.win])).toEqual([
    ["p/a", 0.5, true],
    ["p/b", -1, false],
  ]);
  expect(d.pooled.perTask[1]).toMatchObject({ task: "t2", turnsOn: 5, turnsOff: 4, win: false });
  expect(d.pooled.wins).toBe(0);
  expect(d.pooled.verdict).toBe("retire");
  expect(d.wins).toBe(1);
  expect(d.verdict).toBe("freeze");
});

test("decide counts a pair's on cells that called codegraph", () => {
  const cells = parsed(fullSet((c) => (c.task === "t1" && c.arm === "on" && c.model === "p/b" ? { ...c, codegraphCalls: 0 } : c)));
  const d = decide(tasks, thresholds, cells);
  expect(d.perPair.map((p) => p.picks)).toEqual([1, 0, 1, 1]);
  expect(d.pooled.perTask.map((p) => p.picks)).toEqual([1, 2]);
});

test("decide freezes when a win costs correctness overall, and a cut just under the threshold is no win", () => {
  const lossy = parsed(
    fullSet((c) => {
      if (c.task === "t1" && c.arm === "on") return { ...c, tokens: { total: 500 } };
      if (c.task === "t2" && c.arm === "on" && c.model === "p/a") return cell(tasks[1]!, "on", "p/a", 1, { correct: false });
      return c;
    }),
  );
  expect(decide(tasks, thresholds, lossy).verdict).toBe("freeze");
  const near = parsed(fullSet((c) => (c.arm === "on" ? { ...c, tokens: { total: 751 } } : c)));
  expect(decide(tasks, thresholds, near).verdict).toBe("retire");
});

test("decide freezes when the on arm wins some pairs but fewer than keepWinFraction of them", () => {
  const cells = parsed(fullSet((c) => (c.task === "t1" && c.arm === "on" && c.model === "p/a" ? { ...c, tokens: { total: 500 } } : c)));
  const d = decide(tasks, thresholds, cells);
  expect(d.wins).toBe(1);
  expect(d.verdict).toBe("freeze");
});

test("decide gives no win on a pair where the on arm is cheaper but less often correct", () => {
  const cells = parsed(
    fullSet((c) => {
      if (c.task !== "t1" || c.arm !== "on") return c;
      return cell(tasks[0]!, "on", c.model, 1, { tokens: 100, correct: c.model === "p/a" });
    }),
  );
  const d = decide(tasks, thresholds, cells);
  expect(d.perPair.slice(0, 2).map((p) => [p.model, p.correctOn, p.correctOff, p.win])).toEqual([
    ["p/a", 1, 1, true],
    ["p/b", 0, 1, false],
  ]);
  expect(d.pooled.perTask[0]).toMatchObject({ correctOn: 1, correctOff: 2, win: false });
  expect(d.verdict).toBe("freeze");
});

test("the frozen task set holds 2 impact, 2 test-mapping and 2 trace questions, two per repo, each pinned and key-checked", () => {
  const dir = join(import.meta.dir, "..", "bench", "tasks");
  const frozen = readdirSync(dir).map((f) => ({ file: f, ...JSON.parse(readFileSync(join(dir, f), "utf8")) }));
  const count = (k: string) => Object.fromEntries([...new Set(frozen.map((t) => t[k]))].map((v) => [v, frozen.filter((t) => t[k] === v).length]));
  expect(count("kind")).toEqual({ impact: 2, "test-mapping": 2, trace: 2 });
  expect(count("repo")).toEqual({ "pi-codegraph": 2, "pi-hashline-readmap": 2, "pi-claude-header": 2 });
  for (const t of frozen) {
    expect(t.file).toBe(`${t.id}.json`);
    expect(t.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(t.key.all.length).toBeGreaterThan(0);
    expect(t.keyCheckedBy.length).toBeGreaterThan(0);
    expect(t.question).not.toMatch(/symbol_graph|\bimpact\b|\btrace\b|codegraph/);
  }
});

test("the CLI skips pilot/, exits 1 listing problems, and prints the verdict on a clean set", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-verdict-"));
  const tasksDir = join(dir, "tasks");
  const results = join(dir, "results");
  mkdirSync(tasksDir);
  mkdirSync(join(results, "pilot"), { recursive: true });
  for (const t of tasks) writeFileSync(join(tasksDir, `${t.id}.json`), JSON.stringify(t));
  writeFileSync(join(dir, "thresholds.json"), JSON.stringify(thresholds));
  writeFileSync(join(results, "pilot", "stray__on__p_a__r1.json"), "{}");
  const run = () =>
    spawnSync("bun", [join(import.meta.dir, "..", "bench", "verdict.ts"), "--tasks", tasksDir, "--results", results, "--thresholds", join(dir, "thresholds.json")], {
      encoding: "utf8",
    });

  const empty = run();
  expect(empty.status).toBe(1);
  expect(empty.stderr).toContain("8 problems");
  expect(empty.stderr).not.toContain("stray");

  const files = fullSet((c) => (c.arm === "on" ? { ...c, tokens: { total: 600 } } : c));
  for (const [name, body] of files) writeFileSync(join(results, name), body);
  writeFileSync(join(results, "t1__on__p_a__r1.transcript.jsonl"), "\n");
  const clean = run();
  expect(clean.stderr).toBe("");
  expect(clean.status).toBe(0);
  expect(clean.stdout).toContain("t1  p/a  correct on 1 off 1  tokens on 600 off 1000 cut 40%  turns on 4 off 4 cut 0%  picks 1/1  win");
  expect(clean.stdout).toContain("pooled  t1  correct on 2 off 2  tokens on 600 off 1000 cut 40%  turns on 4 off 4 cut 0%  picks 2/2  win");
  expect(clean.stdout.trim().split("\n").slice(-3)).toEqual(["pooled wins 2/2 keep", "wins 4/4", "keep"]);
});

test("the CLI's --on-results takes the on arm from that directory and only the off arm from --results", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-verdict-"));
  const tasksDir = join(dir, "tasks");
  const results = join(dir, "results");
  const onDir = join(dir, "rerun");
  for (const d of [tasksDir, results, onDir]) mkdirSync(d);
  for (const t of tasks) writeFileSync(join(tasksDir, `${t.id}.json`), JSON.stringify(t));
  writeFileSync(join(dir, "thresholds.json"), JSON.stringify(thresholds));
  for (const [name, body] of fullSet()) writeFileSync(join(results, name), body);
  const writeOn = (edit: (c: CellObj) => CellObj) => {
    for (const [name, body] of fullSet(edit)) if (name.includes("__on__")) writeFileSync(join(onDir, name), body);
  };
  const run = () =>
    spawnSync(
      "bun",
      [join(import.meta.dir, "..", "bench", "verdict.ts"), "--tasks", tasksDir, "--results", results, "--on-results", onDir, "--thresholds", join(dir, "thresholds.json")],
      { encoding: "utf8" },
    );

  writeOn((c) => ({ ...c, tokens: { total: 600 } }));
  const clean = run();
  expect(clean.stderr).toBe("");
  expect(clean.status).toBe(0);
  expect(clean.stdout).toContain("t1  p/a  correct on 1 off 1  tokens on 600 off 1000 cut 40%  turns on 4 off 4 cut 0%  picks 1/1  win");
  expect(clean.stdout).toContain("pooled  t1  correct on 2 off 2  tokens on 600 off 1000 cut 40%  turns on 4 off 4 cut 0%  picks 2/2  win");
  expect(clean.stdout.trim().split("\n").slice(-3)).toEqual(["pooled wins 2/2 keep", "wins 4/4", "keep"]);

  writeOn((c) => ({ ...c, piVersion: "2.0.0" }));
  const mismatched = run();
  expect(mismatched.status).toBe(1);
  expect(mismatched.stderr).toContain("piVersion mismatch: on arm 2.0.0, off arm 1.0.0");

  writeOn((c) => c);
  writeFileSync(join(onDir, "t1__off__p_a__r1.json"), readFileSync(join(results, "t1__off__p_a__r1.json")));
  const doubled = run();
  expect(doubled.status).toBe(1);
  expect(doubled.stderr).toContain("t1__off__p_a__r1.json: in both");
});
