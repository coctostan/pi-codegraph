/**
 * Diff an incremental index against a fresh one, per scripted edit, on a repo at a commit.
 *
 *   bun bench/index-parity.ts
 *
 * Two detached worktrees of this repo's HEAD, deps installed, indexed as `bench/run.ts` indexes an on-arm cell (real
 * tsserver). Per edit: the incremental side restores the first index of the unedited tree, applies the edit and
 * re-indexes; the fresh side applies the same edit to a clean tree and indexes from nothing. Nodes, edges and
 * `test_trace_steps` must match, `created_at` aside. Prints PASS or FAIL per edit with the first differing rows and
 * exits 0 only when every edit passes.
 */
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { indexWorktree, installDeps, sh } from "./run.js";

const TABLES = ["nodes", "edges", "test_trace_steps"] as const;
type Table = (typeof TABLES)[number];
const SHOWN_ROWS = 5;

/** Each table's rows as sorted JSON strings, `created_at` dropped. */
export type GraphSnapshot = Record<Table, string[]>;

export interface TableDiff {
  table: Table;
  onlyIncremental: string[];
  onlyFresh: string[];
}

export interface ParityResult {
  name: string;
  diffs: TableDiff[];
}

export interface Edit {
  name: string;
  apply(dir: string): void;
}

export function snapshotGraph(dbPath: string): GraphSnapshot {
  const db = new Database(dbPath, { readonly: true });
  try {
    const read = (table: Table) =>
      (db.query(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>)
        .map(({ created_at: _, ...row }) => JSON.stringify(row))
        .sort();
    return { nodes: read("nodes"), edges: read("edges"), test_trace_steps: read("test_trace_steps") };
  } finally {
    db.close();
  }
}

/** The tables whose rows differ, each with the rows only one side holds. */
export function diffGraphs(incremental: GraphSnapshot, fresh: GraphSnapshot): TableDiff[] {
  return TABLES.map((table) => {
    const inc = new Set(incremental[table]);
    const fr = new Set(fresh[table]);
    return { table, onlyIncremental: [...inc].filter((r) => !fr.has(r)), onlyFresh: [...fr].filter((r) => !inc.has(r)) };
  }).filter((d) => d.onlyIncremental.length > 0 || d.onlyFresh.length > 0);
}

/** Rewrite `file` under `dir`, refusing when it is missing or `edit` leaves it unchanged. */
function rewrite(dir: string, file: string, edit: (text: string) => string): void {
  const path = join(dir, file);
  const before = readFileSync(path, "utf8");
  const after = edit(before);
  if (after === before) throw new Error(`${file}: the edit found nothing to change`);
  writeFileSync(path, after);
}

// Targets in this repo, each a file other files call into; an edit throws when its target is gone.
export const EDITS: Edit[] = [
  { name: "control", apply: () => {} },
  { name: "comment append", apply: (dir) => rewrite(dir, "src/output/signals.ts", (t) => `${t}// index-parity: comment append\n`) },
  { name: "line shift", apply: (dir) => rewrite(dir, "src/output/trust.ts", (t) => `\n${t}`) },
  {
    name: "callee rename",
    apply: (dir) =>
      rewrite(dir, "src/output/anchoring.ts", (t) => t.replace("export function computeAnchor(", "export function computeAnchorRenamed(")),
  },
  { name: "file removal", apply: (dir) => rmSync(join(dir, "src/output/read-only-ceremony.ts")) },
  {
    name: "file addition",
    apply: (dir) =>
      writeFileSync(
        join(dir, "src/index-parity-added.ts"),
        'import { stripTrustHeader } from "./output/read-only-ceremony.js";\n\nexport function indexParityAdded(text: string): string {\n  return stripTrustHeader(text);\n}\n',
      ),
  },
];

const dbOf = (dir: string) => join(dir, ".codegraph", "graph.db");

/** Back to the commit's tree, keeping the index and installed deps. */
function reset(dir: string): void {
  sh("git", ["reset", "-q", "--hard"], dir);
  sh("git", ["clean", "-fdq", "-e", ".codegraph", "-e", "node_modules"], dir);
}

async function index(dir: string, label: string): Promise<void> {
  const r = await indexWorktree(dir);
  console.error(`${label}: indexed ${r.indexed}, skipped ${r.skipped}, removed ${r.removed}, ${r.errors} errors`);
}

/** Run each edit on an incremental and a fresh worktree of `commit`, both removed afterwards. */
export async function runParity(sourceRepo: string, commit: string, edits: Edit[]): Promise<ParityResult[]> {
  const tmp = mkdtempSync(join(tmpdir(), "codegraph-parity-"));
  const incremental = join(tmp, "incremental");
  const fresh = join(tmp, "fresh");
  const baseline = join(tmp, "baseline.db");
  try {
    for (const dir of [incremental, fresh]) {
      sh("git", ["worktree", "add", "--detach", dir, commit], sourceRepo);
      installDeps(dir);
    }
    await index(incremental, "baseline");
    copyFileSync(dbOf(incremental), baseline);

    const results: ParityResult[] = [];
    for (const edit of edits) {
      reset(incremental);
      copyFileSync(baseline, dbOf(incremental));
      edit.apply(incremental);
      await index(incremental, `${edit.name} incremental`);

      reset(fresh);
      rmSync(join(fresh, ".codegraph"), { recursive: true, force: true });
      edit.apply(fresh);
      await index(fresh, `${edit.name} fresh`);

      results.push({ name: edit.name, diffs: diffGraphs(snapshotGraph(dbOf(incremental)), snapshotGraph(dbOf(fresh))) });
    }
    return results;
  } finally {
    for (const dir of [incremental, fresh]) spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: sourceRepo });
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** PASS or FAIL per edit, a failing one followed by its first differing rows per table; code 0 only when all pass. */
export function report(results: ParityResult[]): { lines: string[]; code: number } {
  const lines: string[] = [];
  const shown = (sign: string, table: Table, rows: string[]) => [
    ...rows.slice(0, SHOWN_ROWS).map((r) => `  ${sign} ${table} ${r}`),
    ...(rows.length > SHOWN_ROWS ? [`  ${sign} ${table} … ${rows.length - SHOWN_ROWS} more`] : []),
  ];
  for (const { name, diffs } of results) {
    if (diffs.length === 0) {
      lines.push(`PASS ${name}`);
      continue;
    }
    lines.push(`FAIL ${name}: ${diffs.map((d) => `${d.table} ${d.onlyIncremental.length} only incremental, ${d.onlyFresh.length} only fresh`).join("; ")}`);
    for (const d of diffs) lines.push(...shown("-", d.table, d.onlyIncremental), ...shown("+", d.table, d.onlyFresh));
  }
  const passed = results.filter((r) => r.diffs.length === 0).length;
  lines.push(`${passed}/${results.length} edits pass`);
  return { lines, code: passed === results.length ? 0 : 1 };
}

if (import.meta.main) {
  const repo = resolve(import.meta.dir, "..");
  const { lines, code } = report(await runParity(repo, sh("git", ["rev-parse", "HEAD"], repo), EDITS));
  for (const line of lines) console.log(line);
  process.exit(code);
}
