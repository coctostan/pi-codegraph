/**
 * Run one benchmark cell (task × arm × model × repeat) headless and write it, graded, as JSON.
 *
 *   bun bench/run.ts --task bench/pilot/compute-anchor-callers.json --arm on --model openai-codex/gpt-6.1-sol --repeat 1
 *
 * Each cell gets a fresh detached worktree of the sibling repo at the task's commit, its deps installed;
 * the on arm is indexed before the timed `pi` run. Both arms load codegraph from this checkout and differ
 * only by `-xt symbol_graph,impact,trace`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { grade, type AnswerKey } from "./grade.js";

export type Arm = "on" | "off";
export const CODEGRAPH_TOOLS = ["symbol_graph", "impact", "trace"];
const BASE_TOOLS = ["read", "grep", "find", "ls", "bash"];
const THINKING = "high";
const PROMPT_SUFFIX =
  "\n\nThis is a read-only question: do not modify any file. " +
  "End your reply with your final answer between a line `<answer>` and a line `</answer>`.";

export interface Task {
  id: string;
  repo: string;
  commit: string;
  question: string;
  key: AnswerKey;
}

export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface TranscriptMetrics {
  offeredTools: string[];
  turns: number;
  tokens: Tokens;
  costUsd: number;
  toolCalls: Record<string, number>;
  codegraphCalls: number;
  stopReason: string | null;
  finalText: string;
}

/** The `pi` argv for one cell: no session, no ambient extensions, skills, context files or MCP. */
export function piArgs(opts: { arm: Arm; model: string; prompt: string; extensions: string[] }): string[] {
  const args = ["-p", "--mode", "json", "--no-session", "-ne", "-ns", "-np", "-nc", "-na", "--no-mcp"];
  for (const ext of opts.extensions) args.push("-e", ext);
  args.push("-t", [...BASE_TOOLS, ...CODEGRAPH_TOOLS].join(","));
  if (opts.arm === "off") args.push("-xt", CODEGRAPH_TOOLS.join(","));
  args.push("--model", opts.model, "--thinking", THINKING, opts.prompt);
  return args;
}

/** Metrics from `pi --mode json` output; only `message_end` events count, so repeated events never double-count. */
export function parseTranscript(jsonl: string): TranscriptMetrics {
  const m: TranscriptMetrics = {
    offeredTools: [],
    turns: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    costUsd: 0,
    toolCalls: {},
    codegraphCalls: 0,
    stopReason: null,
    finalText: "",
  };
  for (const line of jsonl.split("\n")) {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type !== "message_end") continue;
    const msg = event.message;
    for (const tool of msg.toolsAdded ?? []) m.offeredTools.push(tool.name);
    if (msg.role !== "assistant") continue;
    m.turns++;
    const u = msg.usage ?? {};
    m.tokens.input += u.input ?? 0;
    m.tokens.output += u.output ?? 0;
    m.tokens.cacheRead += u.cacheRead ?? 0;
    m.tokens.cacheWrite += u.cacheWrite ?? 0;
    m.tokens.total += u.totalTokens ?? 0;
    m.costUsd += u.cost?.total ?? 0;
    const content: any[] = Array.isArray(msg.content) ? msg.content : [];
    for (const block of content) {
      if (block.type !== "toolCall") continue;
      m.toolCalls[block.name] = (m.toolCalls[block.name] ?? 0) + 1;
      if (CODEGRAPH_TOOLS.includes(block.name)) m.codegraphCalls++;
    }
    m.stopReason = msg.stopReason ?? null;
    m.finalText = content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  return m;
}

/** Why a cell's offered tools don't match its arm, or null when they do. */
export function armProblem(arm: Arm, offeredTools: string[]): string | null {
  const offered = CODEGRAPH_TOOLS.filter((t) => offeredTools.includes(t));
  if (arm === "on" && offered.length < CODEGRAPH_TOOLS.length) {
    return `on arm not offered: ${CODEGRAPH_TOOLS.filter((t) => !offered.includes(t)).join(", ")}`;
  }
  if (arm === "off" && offered.length > 0) return `off arm offered: ${offered.join(", ")}`;
  return null;
}

export function cellId(c: { task: string; arm: Arm; model: string; repeat: number }): string {
  return `${c.task}__${c.arm}__${c.model.replace(/[^A-Za-z0-9.-]/g, "_")}__r${c.repeat}`;
}

function sh(cmd: string, args: string[], cwd: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed in ${cwd}:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function installDeps(dir: string): void {
  if (existsSync(join(dir, "bun.lock"))) sh("bun", ["install", "--frozen-lockfile"], dir);
  else if (existsSync(join(dir, "package-lock.json"))) sh("npm", ["ci", "--no-audit", "--no-fund"], dir);
}

async function indexWorktree(dir: string) {
  const { indexProject } = await import("../src/indexer/pipeline.js");
  const { SqliteGraphStore } = await import("../src/graph/sqlite.js");
  mkdirSync(join(dir, ".codegraph"), { recursive: true });
  const store = new SqliteGraphStore(join(dir, ".codegraph", "graph.db"));
  try {
    return await indexProject(dir, store);
  } finally {
    store.close();
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      task: { type: "string" },
      arm: { type: "string" },
      model: { type: "string" },
      repeat: { type: "string", default: "1" },
      out: { type: "string", default: "bench/results/pilot" },
    },
  });
  const arm = values.arm as Arm;
  if (!values.task || !values.model || (arm !== "on" && arm !== "off")) {
    console.error("usage: bun bench/run.ts --task <file> --arm on|off --model <provider/id> [--repeat n] [--out dir]");
    return 2;
  }
  const repeat = Number(values.repeat);
  const task: Task = JSON.parse(readFileSync(values.task, "utf8"));
  const repoRoot = resolve(import.meta.dir, "..");
  const id = cellId({ task: task.id, arm, model: values.model, repeat });
  const outDir = resolve(values.out!);
  const cellPath = join(outDir, `${id}.json`);
  if (existsSync(cellPath)) {
    console.error(`${cellPath} exists; a recorded cell is never overwritten`);
    return 1;
  }
  // shortcut: target repos and the anthropic-cc provider are resolved as siblings of this checkout; take paths as flags when the bench leaves this machine.
  const sourceRepo = resolve(repoRoot, "..", task.repo);
  const extensions = [join(repoRoot, "src", "index.ts"), resolve(repoRoot, "..", "pi-claude-header", "src", "index.ts")];
  const tmp = mkdtempSync(join(tmpdir(), "codegraph-bench-"));
  const worktree = join(tmp, task.repo);
  sh("git", ["worktree", "add", "--detach", worktree, task.commit], sourceRepo);
  try {
    installDeps(worktree);
    const index = arm === "on" ? await indexWorktree(worktree) : null;
    const startedAt = new Date();
    const pi = spawnSync("pi", piArgs({ arm, model: values.model, prompt: task.question + PROMPT_SUFFIX, extensions }), {
      cwd: worktree,
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    });
    const wallMs = Date.now() - startedAt.getTime();
    const metrics = parseTranscript(pi.stdout ?? "");
    const cell = {
      cell: id,
      task: task.id,
      repo: task.repo,
      commit: task.commit,
      arm,
      model: values.model,
      thinking: THINKING,
      repeat,
      codegraphCommit: sh("git", ["rev-parse", "HEAD"], repoRoot),
      piVersion: sh("pi", ["--version"], worktree),
      startedAt: startedAt.toISOString(),
      wallMs,
      exitCode: pi.status,
      index,
      ...metrics,
      grade: grade(task.key, metrics.finalText),
      stderr: (pi.stderr ?? "").slice(-2000),
    };
    mkdirSync(outDir, { recursive: true });
    writeFileSync(cellPath, JSON.stringify(cell, null, 2) + "\n");
    const transcript = (pi.stdout ?? "").split("\n").filter((l) => l.startsWith('{"type":"message_end"'));
    writeFileSync(join(outDir, `${id}.transcript.jsonl`), transcript.join("\n") + "\n");
    const problem = armProblem(arm, metrics.offeredTools);
    console.log(
      `${id}: correct=${cell.grade.correct} tokens=${metrics.tokens.total} turns=${metrics.turns} codegraph=${metrics.codegraphCalls} wall=${wallMs}ms`,
    );
    if (problem) console.error(`${id}: ${problem}`);
    if (index && index.errors > 0) console.error(`${id}: indexing reported ${index.errors} errors`);
    if (pi.status !== 0) console.error(`${id}: pi exited ${pi.status}${pi.error ? ` (${pi.error.message})` : ""}`);
    return problem || (index && index.errors > 0) || pi.status !== 0 ? 1 : 0;
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: sourceRepo });
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exit(await main());
