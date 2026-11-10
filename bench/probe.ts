/**
 * Probe the graph against the bench keys: one fixed tool call per probe, on a bench repo at its task's pinned commit.
 *
 *   bun bench/probe.ts [id-prefix]
 *
 * Each repo@commit gets a fresh detached worktree, its deps installed and indexed as `bench/run.ts` indexes an
 * on-arm cell; the tool runs through its registered `execute()`, so the text checked is what an on-arm agent saw.
 * Prints PASS or FAIL per probe and exits 0 only when every selected probe passes.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { indexWorktree, installDeps, sh } from "./run.js";

/** Substring checks on a tool's output text: `ordered` items must also appear, first occurrences in that order. */
export interface ProbeExpect {
  all?: string[];
  none?: string[];
  ordered?: string[];
  maxChars?: number;
  /** The call must not come back `isError`. */
  resolves?: boolean;
}

export interface Probe {
  id: string;
  repo: string;
  commit: string;
  tool: string;
  params: Record<string, unknown>;
  expect: ProbeExpect;
}

export interface ProbeResult {
  id: string;
  failures: string[];
  chars: number;
}

/** Each unmet expectation as one line; empty when the output passes. */
export function checkProbe(expect: ProbeExpect, out: { text: string; isError: boolean }): string[] {
  const { text } = out;
  const failures: string[] = [];
  if (expect.resolves && out.isError) failures.push("did not resolve");
  const missing = [...new Set([...(expect.all ?? []), ...(expect.ordered ?? [])])].filter((s) => !text.includes(s));
  if (missing.length > 0) failures.push(`missing: ${missing.join(", ")}`);
  const present = (expect.none ?? []).filter((s) => text.includes(s));
  if (present.length > 0) failures.push(`present: ${present.join(", ")}`);
  const found = (expect.ordered ?? []).filter((s) => text.includes(s));
  const outOfOrder = found.findIndex((s, i) => i > 0 && text.indexOf(s) < text.indexOf(found[i - 1]!));
  if (outOfOrder > 0) failures.push(`out of order: ${found[outOfOrder]} before ${found[outOfOrder - 1]}`);
  if (expect.maxChars !== undefined && text.length > expect.maxChars) failures.push(`${text.length} chars > ${expect.maxChars}`);
  return failures;
}

type Execute = (
  id: string,
  params: unknown,
  signal: undefined,
  onUpdate: undefined,
  ctx: { cwd: string },
) => Promise<{ content: Array<{ text?: string }>; isError?: boolean }>;

/** Run the probes, one worktree per repo@commit under `reposDir/<repo>`, removed afterwards. */
export async function runProbes(probes: Probe[], reposDir: string): Promise<ProbeResult[]> {
  const ext = await import("../src/index.js");
  const tools = new Map<string, Execute>();
  let shutdown = async () => {};
  ext.default({
    registerTool: (tool: { name: string; execute: Execute }) => tools.set(tool.name, tool.execute),
    on: (event: string, handler: () => Promise<void>) => {
      if (event === "session_shutdown") shutdown = handler;
    },
  } as any);

  const results: ProbeResult[] = [];
  for (const group of Map.groupBy(probes, (p) => `${p.repo}@${p.commit}`).values()) {
    const { repo, commit } = group[0]!;
    const sourceRepo = join(reposDir, repo);
    const tmp = mkdtempSync(join(tmpdir(), "codegraph-probe-"));
    const worktree = join(tmp, repo);
    try {
      sh("git", ["worktree", "add", "--detach", worktree, commit], sourceRepo);
      installDeps(worktree);
      const { indexed, errors, partial } = await indexWorktree(worktree);
      console.error(`${repo}@${commit.slice(0, 8)}: indexed ${indexed} files, ${errors} errors, ${partial.length} partially parsed`);
      for (const probe of group) {
        const execute = tools.get(probe.tool);
        if (!execute) throw new Error(`probe ${probe.id}: no tool named ${probe.tool}`);
        try {
          const out = await execute(probe.id, probe.params, undefined, undefined, { cwd: worktree });
          const text = out.content.map((c) => c.text ?? "").join("\n");
          results.push({ id: probe.id, failures: checkProbe(probe.expect, { text, isError: out.isError === true }), chars: text.length });
        } catch (err) {
          results.push({ id: probe.id, failures: [`threw: ${err instanceof Error ? err.message : String(err)}`], chars: 0 });
        }
      }
    } finally {
      await shutdown();
      spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: sourceRepo });
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return results;
}

/** The CLI: 0 when every probe whose id starts with `prefix` passes, 1 when one fails, 2 when none match. */
export async function main(
  prefix = process.argv[2] ?? "",
  probesPath = join(import.meta.dir, "probes.json"),
  // shortcut: bench repos are resolved as siblings of this checkout, as in bench/run.ts; take a flag when the bench leaves this machine.
  reposDir = resolve(import.meta.dir, "..", ".."),
): Promise<number> {
  const probes: Probe[] = JSON.parse(readFileSync(probesPath, "utf8"));
  const selected = probes.filter((p) => p.id.startsWith(prefix));
  if (selected.length === 0) {
    console.error(`no probe id starts with "${prefix}"`);
    return 2;
  }
  const results = await runProbes(selected, reposDir);
  for (const r of results) {
    console.log(r.failures.length === 0 ? `PASS ${r.id} (${r.chars} chars)` : `FAIL ${r.id} (${r.chars} chars): ${r.failures.join("; ")}`);
  }
  const failed = results.filter((r) => r.failures.length > 0).length;
  console.log(`${results.length - failed}/${results.length} probes pass`);
  return failed > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(await main());
