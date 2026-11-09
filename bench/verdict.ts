/**
 * Audit the graded cells under `bench/results/` and print the keep/freeze/retire verdict by `bench/thresholds.json`,
 * judged per task-model pair, with the verdict over both models pooled per task beside it.
 *
 *   bun bench/verdict.ts [--tasks bench/tasks] [--results bench/results] [--on-results dir] [--thresholds bench/thresholds.json]
 *
 * With `--on-results`, the on arm comes from that directory and only the off cells of `--results` count.
 * Exits 1, listing each problem, on a missing, extra, malformed, mis-armed or mis-graded cell, or cells run on
 * different pi versions or anthropic-cc provider commits. Only `*.json` files directly under a results directory count, so `pilot/` and the
 * transcripts are skipped.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { grade } from "./grade.js";
import { armProblem, cellId, type Arm, type Task } from "./run.js";

export interface Thresholds {
  models: string[];
  repeats: number;
  minCut: number;
  keepWinFraction: number;
}

/** One task's arms compared, for one model, or both pooled when `model` is absent. */
export interface TaskResult {
  task: string;
  model?: string;
  correctOn: number;
  correctOff: number;
  tokensOn: number;
  tokensOff: number;
  tokensCut: number;
  turnsOn: number;
  turnsOff: number;
  turnsCut: number;
  /** On cells that called a codegraph tool, of `onCells`. */
  picks: number;
  onCells: number;
  win: boolean;
}

export type Verdict = "keep" | "freeze" | "retire";

const ARMS: Arm[] = ["on", "off"];
/** Fields every cell must share; a cell without one counts as the value `none`. */
const PINNED = ["piVersion", "providerCommit"] as const;

function expectedCells(tasks: Task[], t: Thresholds) {
  const cells = new Map<string, { task: Task; arm: Arm; model: string; repeat: number }>();
  for (const task of tasks) {
    for (const arm of ARMS) {
      for (const model of t.models) {
        for (let repeat = 1; repeat <= t.repeats; repeat++) {
          cells.set(`${cellId({ task: task.id, arm, model, repeat })}.json`, { task, arm, model, repeat });
        }
      }
    }
  }
  return cells;
}

/** Every reason the cell files, keyed by file name, can't feed a verdict; empty when they all can. */
export function auditCells(tasks: Task[], thresholds: Thresholds, files: Map<string, string>): string[] {
  const expected = expectedCells(tasks, thresholds);
  const problems: string[] = tasks.length === 0 ? ["no tasks"] : [];
  for (const name of files.keys()) if (!expected.has(name)) problems.push(`${name}: unexpected cell`);
  const pins = Object.fromEntries(PINNED.map((f) => [f, { on: new Set(), off: new Set() }])) as Record<(typeof PINNED)[number], Record<Arm, Set<unknown>>>;
  for (const [name, want] of expected) {
    const raw = files.get(name);
    if (raw === undefined) {
      problems.push(`${name}: missing`);
      continue;
    }
    let c: any;
    try {
      c = JSON.parse(raw);
    } catch {
      problems.push(`${name}: malformed, not JSON`);
      continue;
    }
    const count = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;
    const typed =
      count(c?.turns) &&
      count(c.tokens?.total) &&
      count(c.codegraphCalls) &&
      typeof c.grade?.correct === "boolean" &&
      typeof c.finalText === "string" &&
      typeof c.piVersion === "string" &&
      Array.isArray(c.offeredTools) &&
      c.offeredTools.every((t: unknown) => typeof t === "string");
    if (!typed) {
      problems.push(`${name}: malformed: turns, tokens.total, codegraphCalls, grade.correct, finalText, piVersion or offeredTools missing or ill-typed`);
      continue;
    }
    for (const f of PINNED) pins[f][want.arm].add(c[f] ?? "none");
    const identity: Record<string, unknown> = {
      cell: name.slice(0, -".json".length),
      task: want.task.id,
      commit: want.task.commit,
      arm: want.arm,
      model: want.model,
      repeat: want.repeat,
    };
    for (const [field, value] of Object.entries(identity)) {
      if (c[field] !== value) problems.push(`${name}: ${field} is ${c[field]}, expected ${value}`);
    }
    if (c.exitCode !== 0) problems.push(`${name}: pi exited ${c.exitCode}`);
    const armed = armProblem(want.arm, c.offeredTools);
    if (armed) problems.push(`${name}: ${armed}`);
    if (want.arm === "off" && c.codegraphCalls > 0) problems.push(`${name}: off arm made ${c.codegraphCalls} codegraph calls`);
    if (want.arm === "on" && typeof c.index?.errors !== "number") problems.push(`${name}: on arm has no index`);
    else if (want.arm === "on" && c.index.errors > 0) problems.push(`${name}: indexing reported ${c.index.errors} errors`);
    const regraded = grade(want.task.key, c.finalText).correct;
    if (regraded !== c.grade.correct) problems.push(`${name}: recorded grade correct=${c.grade.correct}, key gives ${regraded}`);
  }
  for (const f of PINNED) {
    const seen = pins[f];
    if (new Set([...seen.on, ...seen.off]).size <= 1) continue;
    const named = ARMS.filter((a) => seen[a].size > 0);
    problems.push(`${f} mismatch: ${named.map((a) => `${a} arm ${[...seen[a]].sort().join("/")}`).join(", ")}`);
  }
  return problems;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const cut = (on: number, off: number) => (off > 0 ? (off - on) / off : 0);

function compare(task: string, model: string | undefined, on: any[], off: any[], t: Thresholds): TaskResult {
  const correct = (cs: any[]) => cs.filter((c) => c.grade.correct).length;
  const tokens = (cs: any[]) => median(cs.map((c) => c.tokens.total));
  const turns = (cs: any[]) => median(cs.map((c) => c.turns));
  const r = {
    task,
    model,
    correctOn: correct(on),
    correctOff: correct(off),
    tokensOn: tokens(on),
    tokensOff: tokens(off),
    turnsOn: turns(on),
    turnsOff: turns(off),
    picks: on.filter((c) => c.codegraphCalls > 0).length,
    onCells: on.length,
  };
  const tokensCut = cut(r.tokensOn, r.tokensOff);
  const turnsCut = cut(r.turnsOn, r.turnsOff);
  const win = r.correctOn >= r.correctOff && (tokensCut >= t.minCut || turnsCut >= t.minCut);
  return { ...r, tokensCut, turnsCut, win };
}

function verdictOf(results: TaskResult[], t: Thresholds): { verdict: Verdict; wins: number } {
  const wins = results.filter((r) => r.win).length;
  const sum = (k: "correctOn" | "correctOff") => results.reduce((n, r) => n + r[k], 0);
  const verdict: Verdict =
    sum("correctOn") >= sum("correctOff") && wins >= t.keepWinFraction * results.length ? "keep" : wins === 0 ? "retire" : "freeze";
  return { verdict, wins };
}

/** The verdict over audited cells, judged per task-model pair, with the per-task verdict, both models pooled, beside it. */
export function decide(
  tasks: Task[],
  t: Thresholds,
  cells: any[],
): { verdict: Verdict; wins: number; perPair: TaskResult[]; pooled: { verdict: Verdict; wins: number; perTask: TaskResult[] } } {
  const arm = (task: Task, a: Arm, model?: string) =>
    cells.filter((c) => c.task === task.id && c.arm === a && (model === undefined || c.model === model));
  const perPair = tasks.flatMap((task) => t.models.map((m) => compare(task.id, m, arm(task, "on", m), arm(task, "off", m), t)));
  const perTask = tasks.map((task) => compare(task.id, undefined, arm(task, "on"), arm(task, "off"), t));
  return { ...verdictOf(perPair, t), perPair, pooled: { ...verdictOf(perTask, t), perTask } };
}

function main(): number {
  const { values } = parseArgs({
    options: {
      tasks: { type: "string", default: "bench/tasks" },
      results: { type: "string", default: "bench/results" },
      "on-results": { type: "string" },
      thresholds: { type: "string", default: "bench/thresholds.json" },
    },
  });
  const thresholds: Thresholds = JSON.parse(readFileSync(values.thresholds!, "utf8"));
  const tasks: Task[] = readdirSync(values.tasks!)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(values.tasks!, f), "utf8")));
  const onDir = values["on-results"];
  const dirs = onDir ? [values.results!, onDir] : [values.results!];
  const files = new Map<string, string>();
  const problems: string[] = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      // A cell name is `<task>__<arm>__<model>__r<n>`; with --on-results, --results gives only its off arm.
      if (!name.endsWith(".json") || (onDir && dir === values.results && name.split("__")[1] !== "off")) continue;
      if (files.has(name)) problems.push(`${name}: in both ${dirs.join(" and ")}`);
      files.set(name, readFileSync(join(dir, name), "utf8"));
    }
  }
  problems.push(...auditCells(tasks, thresholds, files));
  if (problems.length > 0) {
    console.error(`${problems.length} problems in ${dirs.join(" and ")}:\n${problems.join("\n")}`);
    return 1;
  }
  const { verdict, wins, perPair, pooled } = decide(tasks, thresholds, [...files.values()].map((s) => JSON.parse(s)));
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const row = (r: TaskResult) =>
    `correct on ${r.correctOn} off ${r.correctOff}  tokens on ${r.tokensOn} off ${r.tokensOff} cut ${pct(r.tokensCut)}  turns on ${r.turnsOn} off ${r.turnsOff} cut ${pct(r.turnsCut)}  picks ${r.picks}/${r.onCells}  ${r.win ? "win" : "-"}`;
  for (const r of perPair) console.log(`${r.task}  ${r.model}  ${row(r)}`);
  for (const r of pooled.perTask) console.log(`pooled  ${r.task}  ${row(r)}`);
  console.log(`pooled wins ${pooled.wins}/${pooled.perTask.length} ${pooled.verdict}`);
  console.log(`wins ${wins}/${perPair.length}`);
  console.log(verdict);
  return 0;
}

if (import.meta.main) process.exit(main());
