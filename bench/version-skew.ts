/**
 * Replay a codegraph version gap on a worktree of this repo, through pi's real loader.
 *
 *   bun bench/version-skew.ts
 *
 * Each tool call is AGENTS.md's loader in a `bun` subprocess run in the code's own repo, so each version resolves its
 * own pi. Current code is this checkout's working tree; the older code is `OLDER_COMMIT`, from before class members,
 * in a detached worktree of its own. Both cases run on one detached worktree of HEAD, deps installed:
 * - older-writer: current code indexes the tree, `src/graph/sqlite.ts` is edited, the older code re-indexes it, then
 *   current code answers `symbol_graph` on `MEMBER`; its `Class.member` count is compared with a fresh index's.
 * - newer-index: current code indexes the tree, its `schema_version` is set one above `SCHEMA_VERSION`,
 *   `src/graph/store.ts` is edited, and one `symbol_graph` call's Trust line and the db's sha256 are read.
 * Prints PASS or FAIL per case with what it saw, and exits 0 only when both pass.
 */
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SCHEMA_VERSION } from "../src/graph/sqlite.js";
import { reset } from "./index-parity.js";
import { installDeps, sh } from "./run.js";

/** The commit before class-trace (Agents trace through classes)'s slice 1 (Index class members as symbols). */
export const OLDER_COMMIT = "90b1cc72^";
export const MEMBER = "SqliteGraphStore.addEdge";

export interface ToolAnswer {
  text: string;
  isError: boolean;
}

export interface OlderWriterSeen {
  answer: ToolAnswer;
  membersBefore: number;
  membersAfterOlder: number;
  members: number;
  freshMembers: number;
}

export interface NewerIndexSeen {
  answer: ToolAnswer;
  indexVersion: number;
  codeVersion: number;
  before: string;
  after: string;
}

export interface CaseResult {
  name: string;
  problems: string[];
  seen: string;
}

// AGENTS.md's loader, printing the answer as JSON: argv is the extension, the project, pi's agent dir, tool, params.
const LOADER = `import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
const [ext, cwd, agentDir, tool, params] = process.argv.slice(1);
const r = await discoverAndLoadExtensions([ext], cwd, agentDir);
const t = r.extensions[0].tools.get(tool);
const o = await (t.definition ?? t).execute("p", JSON.parse(params), undefined, undefined, { cwd });
console.log(JSON.stringify({ text: o.content[0].text, isError: o.isError === true }));
process.exit(0);`;

/** One tool call by the codegraph in `codeRepo` on the project at `project`, as a fresh pi process makes it. */
export function callTool(codeRepo: string, project: string, agentDir: string, tool: string, params: object): ToolAnswer {
  const out = sh("bun", ["-e", LOADER, join(codeRepo, "src", "index.ts"), project, agentDir, tool, JSON.stringify(params)], codeRepo);
  return JSON.parse(out.split("\n").at(-1)!) as ToolAnswer;
}

/** `function` nodes named `<C>.<m>` beside a `class` node `<C>` in their own file. */
export function countMembers(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db
      .query(
        `SELECT count(DISTINCT f.id) AS n FROM nodes f JOIN nodes c
           ON c.kind = 'class' AND c.file = f.file AND substr(f.name, 1, length(c.name) + 1) = c.name || '.'
         WHERE f.kind = 'function'`,
      )
      .get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

export function trustOf(text: string): string | null {
  return /^Trust: (\w+)/m.exec(text)?.[1] ?? null;
}

/** An error's message, the Trust line aside; `resolved` for an answer. */
function answerLine(a: ToolAnswer): string {
  return a.isError ? (a.text.split("\n").find((l) => l.trim() && !l.startsWith("Trust:")) ?? "error") : "resolved";
}

export function judgeOlderWriter(s: OlderWriterSeen): CaseResult {
  const trust = trustOf(s.answer.text) ?? "none";
  const problems: string[] = [];
  if (s.answer.isError) problems.push(`${MEMBER} not resolved`);
  if (trust !== "fresh") problems.push(`Trust: ${trust}, not fresh`);
  if (s.membersAfterOlder >= s.membersBefore) {
    problems.push(`the older run left all ${s.membersBefore} Class.member nodes in place: the replay proves nothing`);
  }
  if (s.freshMembers === 0) problems.push("a fresh index holds no Class.member node");
  else if (s.members !== s.freshMembers) problems.push(`${s.members} Class.member nodes against ${s.freshMembers} in a fresh index`);
  const seen =
    `symbol_graph ${MEMBER}: ${answerLine(s.answer)} under Trust: ${trust}; Class.member nodes ${s.membersBefore} → ` +
    `${s.membersAfterOlder} after the older run, ${s.members} after the current answer, ${s.freshMembers} in a fresh index`;
  return { name: "older-writer", problems, seen };
}

export function judgeNewerIndex(s: NewerIndexSeen): CaseResult {
  const trust = trustOf(s.answer.text) ?? "none";
  const names = (line: string, n: number) => new RegExp(`\\b${n}\\b`).test(line);
  const lines = s.answer.text.split("\n");
  const problems: string[] = [];
  if (s.before !== s.after) problems.push("graph.db changed");
  if (trust !== "stale") problems.push(`Trust: ${trust}, not stale`);
  if (!lines.some((l) => /version/i.test(l) && names(l, s.indexVersion) && names(l, s.codeVersion))) {
    problems.push(`no line names index version ${s.indexVersion} and code version ${s.codeVersion}`);
  }
  if (!/restart pi/i.test(s.answer.text)) problems.push("no recommendation to restart pi");
  const seen =
    `index version ${s.indexVersion}, code version ${s.codeVersion}; Trust: ${trust}; ` +
    `graph.db sha256 ${s.before.slice(0, 8)}… → ${s.after.slice(0, 8)}…`;
  return { name: "newer-index", problems, seen };
}

/** PASS or FAIL per case with what it saw; code 0 only when all pass. */
export function report(results: CaseResult[]): { lines: string[]; code: number } {
  const lines = results.map(({ name, problems, seen }) =>
    problems.length === 0 ? `PASS ${name} — ${seen}` : `FAIL ${name}: ${problems.join("; ")} — ${seen}`,
  );
  const passed = results.filter((r) => r.problems.length === 0).length;
  lines.push(`${passed}/${results.length} cases pass`);
  return { lines, code: passed === results.length ? 0 : 1 };
}

const dbOf = (dir: string) => join(dir, ".codegraph", "graph.db");
const edit = (dir: string, file: string) => appendFileSync(join(dir, file), "// version-skew: an edit\n");

/** The db's sha256, its `-wal` included when one exists. */
function hashDb(dir: string): string {
  const hash = createHash("sha256");
  for (const suffix of ["", "-wal"]) if (existsSync(dbOf(dir) + suffix)) hash.update(readFileSync(dbOf(dir) + suffix));
  return hash.digest("hex");
}

function olderWriter(current: string, older: string, tree: string, agentDir: string): CaseResult {
  const ask = () => callTool(current, tree, agentDir, "symbol_graph", { name: MEMBER });
  ask();
  const membersBefore = countMembers(dbOf(tree));
  edit(tree, "src/graph/sqlite.ts");
  callTool(older, tree, agentDir, "symbol_graph", { name: "indexProject" });
  const membersAfterOlder = countMembers(dbOf(tree));
  const answer = ask();
  const members = countMembers(dbOf(tree));
  rmSync(join(tree, ".codegraph"), { recursive: true, force: true });
  ask();
  return judgeOlderWriter({ answer, membersBefore, membersAfterOlder, members, freshMembers: countMembers(dbOf(tree)) });
}

function newerIndex(current: string, tree: string, agentDir: string): CaseResult {
  const ask = () => callTool(current, tree, agentDir, "symbol_graph", { name: "openDb" });
  reset(tree);
  rmSync(join(tree, ".codegraph"), { recursive: true, force: true });
  ask();
  const indexVersion = SCHEMA_VERSION + 1;
  const db = new Database(dbOf(tree));
  try {
    db.run("UPDATE schema_version SET version = ?", [indexVersion]);
  } finally {
    db.close();
  }
  edit(tree, "src/graph/store.ts");
  const before = hashDb(tree);
  const answer = ask();
  return judgeNewerIndex({ answer, indexVersion, codeVersion: SCHEMA_VERSION, before, after: hashDb(tree) });
}

/** The CLI: prints the report for both cases on `repo` at `commit`, the older code at `older`, returning its exit code. */
export function main(
  repo = resolve(import.meta.dir, ".."),
  commit = sh("git", ["rev-parse", "HEAD"], repo),
  older = OLDER_COMMIT,
): number {
  const tmp = mkdtempSync(join(tmpdir(), "codegraph-skew-"));
  const tree = join(tmp, "tree");
  const olderCode = join(tmp, "older");
  const agentDir = join(tmp, "agent");
  try {
    mkdirSync(agentDir);
    for (const [dir, at] of [[tree, commit], [olderCode, older]] as const) {
      sh("git", ["worktree", "add", "--detach", dir, at], repo);
      installDeps(dir);
    }
    const { lines, code } = report([olderWriter(repo, olderCode, tree, agentDir), newerIndex(repo, tree, agentDir)]);
    for (const line of lines) console.log(line);
    return code;
  } finally {
    for (const dir of [tree, olderCode]) spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: repo });
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exit(main());
