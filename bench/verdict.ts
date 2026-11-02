/**
 * Audit the graded cells under `bench/results/` and print the keep/freeze/retire verdict by `bench/thresholds.json`.
 *
 *   bun bench/verdict.ts [--tasks bench/tasks] [--results bench/results] [--thresholds bench/thresholds.json]
 *
 * Exits 1, listing each problem, on a missing, extra, malformed, mis-armed or mis-graded cell. Only `*.json` files
 * directly under the results directory count, so `pilot/` and the transcripts are skipped.
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

export interface TaskResult {
  task: string;
  correctOn: number;
  correctOff: number;
  tokensOn: number;
  tokensOff: number;
  tokensCut: number;
  turnsOn: number;
  turnsOff: number;
  turnsCut: number;
  win: boolean;
}

export type Verdict = "keep" | "freeze" | "retire";

const ARMS: Arm[] = ["on", "off"];

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
      Array.isArray(c.offeredTools) &&
      c.offeredTools.every((t: unknown) => typeof t === "string");
    if (!typed) {
      problems.push(`${name}: malformed: turns, tokens.total, codegraphCalls, grade.correct, finalText or offeredTools missing or ill-typed`);
      continue;
    }
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
  return problems;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const cut = (on: number, off: number) => (off > 0 ? (off - on) / off : 0);

/** The verdict over audited cells, both models pooled per task. */
export function decide(tasks: Task[], t: Thresholds, cells: any[]): { verdict: Verdict; wins: number; perTask: TaskResult[] } {
  const perTask = tasks.map((task): TaskResult => {
    const arm = (a: Arm) => cells.filter((c) => c.task === task.id && c.arm === a);
    const [on, off] = [arm("on"), arm("off")];
    const correct = (cs: any[]) => cs.filter((c) => c.grade.correct).length;
    const tokens = (cs: any[]) => median(cs.map((c) => c.tokens.total));
    const turns = (cs: any[]) => median(cs.map((c) => c.turns));
    const r = {
      task: task.id,
      correctOn: correct(on),
      correctOff: correct(off),
      tokensOn: tokens(on),
      tokensOff: tokens(off),
      turnsOn: turns(on),
      turnsOff: turns(off),
    };
    const tokensCut = cut(r.tokensOn, r.tokensOff);
    const turnsCut = cut(r.turnsOn, r.turnsOff);
    const win = r.correctOn >= r.correctOff && (tokensCut >= t.minCut || turnsCut >= t.minCut);
    return { ...r, tokensCut, turnsCut, win };
  });
  const wins = perTask.filter((r) => r.win).length;
  const sum = (k: "correctOn" | "correctOff") => perTask.reduce((n, r) => n + r[k], 0);
  const verdict: Verdict =
    sum("correctOn") >= sum("correctOff") && wins >= t.keepWinFraction * tasks.length ? "keep" : wins === 0 ? "retire" : "freeze";
  return { verdict, wins, perTask };
}

function main(): number {
  const { values } = parseArgs({
    options: {
      tasks: { type: "string", default: "bench/tasks" },
      results: { type: "string", default: "bench/results" },
      thresholds: { type: "string", default: "bench/thresholds.json" },
    },
  });
  const thresholds: Thresholds = JSON.parse(readFileSync(values.thresholds!, "utf8"));
  const tasks: Task[] = readdirSync(values.tasks!)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(values.tasks!, f), "utf8")));
  const files = new Map<string, string>();
  for (const name of readdirSync(values.results!)) {
    if (name.endsWith(".json")) files.set(name, readFileSync(join(values.results!, name), "utf8"));
  }
  const problems = auditCells(tasks, thresholds, files);
  if (problems.length > 0) {
    console.error(`${problems.length} problems in ${values.results}:\n${problems.join("\n")}`);
    return 1;
  }
  const { verdict, wins, perTask } = decide(tasks, thresholds, [...files.values()].map((s) => JSON.parse(s)));
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  for (const r of perTask) {
    console.log(
      `${r.task}  correct on ${r.correctOn} off ${r.correctOff}  tokens on ${r.tokensOn} off ${r.tokensOff} cut ${pct(r.tokensCut)}  turns on ${r.turnsOn} off ${r.turnsOff} cut ${pct(r.turnsCut)}  ${r.win ? "win" : "-"}`,
    );
  }
  console.log(`wins ${wins}/${tasks.length}`);
  console.log(verdict);
  return 0;
}

if (import.meta.main) process.exit(main());
