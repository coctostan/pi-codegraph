import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { FailedLookup, GraphStore } from "../graph/store.js";
import { extractFile, sha256Hex } from "./tree-sitter.js";
import { runLspIndexStage } from "./lsp.js";
import { runAstGrepIndexStage } from "./ast-grep.js";
import { runCoverageIndexStage } from "./coverage.js";
import { runGitCoChangeStage } from "./git.js";
import { TsServerClient } from "./tsserver-client.js";
import type { ITsServerClient } from "./tsserver-client.js";

export interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
  /** Files this run indexed from tree-sitter's recovered tree, having parsed them with errors. */
  partial: string[];
  timings: Record<string, number>;
}

export interface IndexProjectOptions {
  lspClientFactory?: (projectRoot: string) => ITsServerClient;
  coverageDir?: string;
}

function toPosixPath(p: string): string {
  return p.split(sep).join("/");
}

const SKIPPED_DIRS = new Set(["node_modules", ".megapowers", ".git"]);

function walkTsFiles(root: string): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_DIRS.has(ent.name)) continue;
      const full = join(dir, ent.name);

      if (ent.isDirectory()) {
        walk(full);
        continue;
      }

      if (ent.isFile() && (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx"))) {
        out.push(full);
      }
    }
  };

  walk(root);
  return out;
}

/** `git check-ignore` exits 0 when the path is ignored, 1 when not. */
function isIgnoredByGit(root: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "."], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
/** The `.ts`/`.tsx` files git lists under `root`, tracked or untracked but not ignored; the walk outside a repo. */
function listTsFiles(root: string): string[] {
  let listed: string[];
  try {
    listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\0").filter(Boolean);
  } catch {
    return walkTsFiles(root);
  }
  // A root its repo ignores (a dotfiles repo's `/*`) lists nothing; index it as a plain tree, as outside a repo.
  if (listed.length === 0 && isIgnoredByGit(root)) return walkTsFiles(root);
  // A Set drops the repeat an unmerged path gets per conflict stage; lstat keeps regular files as the walk does, dropping symlinks and tracked files deleted from disk.
  return [...new Set(listed)]
    .filter((rel) => (rel.endsWith(".ts") || rel.endsWith(".tsx")) && !rel.split("/").some((part) => SKIPPED_DIRS.has(part)))
    .map((rel) => join(root, rel))
    .filter((abs) => lstatSync(abs, { throwIfNoEntry: false })?.isFile() === true);
}

export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult> {
  const timings: Record<string, number> = {};

  const tsStart = performance.now();
  const files = listTsFiles(projectRoot);

  let indexed = 0;
  let skipped = 0;
  let removed = 0;
  let errors = 0;
  const lost: FailedLookup[] = [];
  const lose = (source: string, evidence: string, count = 1) => {
    errors += count;
    if (count > 0) lost.push({ kind: "index", source, evidence });
  };
  const partial: string[] = [];
  const changedFiles: string[] = [];

  /** Write `rel`'s extraction over what indexing it last wrote, keeping the edges into it from other files. */
  const extractInto = (rel: string, content: string, hash: string) => {
    store.clearFile(rel);
    const extracted = extractFile(rel, content);
    store.addNode(extracted.module);
    for (const node of extracted.nodes) store.addNode(node);
    for (const edge of extracted.edges) store.addEdge(edge);
    store.setFileHash(rel, hash, extracted.partial);
    if (extracted.partial) partial.push(rel);
    changedFiles.push(rel);
  };

  const currentRel = new Set(files.map((absPath) => toPosixPath(relative(projectRoot, absPath))));

  // A removed file's edges go with it, so first blank the hash of each current file calling into it: the loop below,
  // or the next run's should this one stop, re-extracts it, its calls reading unresolved as on a fresh index. The git
  // and coverage stages rebuild their own edges.
  for (const oldFile of store.listFiles()) {
    if (currentRel.has(oldFile)) continue;
    try {
      for (const { file } of store.queryRows<{ file: string }>(
        "SELECT DISTINCT s.file FROM edges e JOIN nodes s ON s.id = e.source JOIN nodes t ON t.id = e.target WHERE t.file = ? AND e.provenance_source NOT IN ('git', 'coverage')",
        [oldFile],
      )) {
        store.setFileHash(file, "");
      }
      store.deleteFile(oldFile);
      removed++;
    } catch {
      lose(oldFile, "remove");
    }
  }
  const read = (rel: string): string | null => {
    try {
      return readFileSync(join(projectRoot, rel), "utf8");
    } catch {
      lose(rel, "read");
      return null;
    }
  };
  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));
    const content = read(rel);
    if (content === null) continue;
    try {
      const hash = sha256Hex(content);
      if (store.getFileHash(rel) === hash) {
        skipped++;
        continue;
      }
      extractInto(rel, content, hash);
      indexed++;
    } catch {
      lose(rel, "extract");
    }
  }

  // A kept edge into a changed file whose target moved or went: re-extract its unchanged source, so the lsp stage
  // resolves that call anew. Its node ids come back the same, so no edge into it dangles in turn. The coverage stage
  // rewrites its own edges.
  const dangling = store.queryRows<{ file: string }>(
    "SELECT DISTINCT n.file FROM edges e JOIN nodes n ON n.id = e.source WHERE e.provenance_source <> 'coverage' AND SUBSTR(e.target, 1, 16) <> '__unresolved__::' AND SUBSTR(e.target, 1, 12) <> '__member__::' AND e.target NOT IN (SELECT id FROM nodes)",
  );
  for (const { file } of dangling) {
    const content = read(file);
    if (content === null) continue;
    try {
      extractInto(file, content, sha256Hex(content));
    } catch {
      lose(file, "extract");
    }
  }
  timings["tree-sitter"] = Math.round(performance.now() - tsStart);

  const lspStart = performance.now();
  const client = options.lspClientFactory ? options.lspClientFactory(projectRoot) : new TsServerClient(projectRoot);
  try {
    lose("lsp stage", "write", await runLspIndexStage(store, projectRoot, client));
  } finally {
    await client.shutdown().catch(() => {});
  }
  timings["lsp"] = Math.round(performance.now() - lspStart);
  const astGrepStart = performance.now();
  const astGrepErrors = await runAstGrepIndexStage(store, projectRoot, changedFiles);
  // The stage scans changed files alone, so blank their hashes for the next run to scan them again.
  if (astGrepErrors > 0) for (const file of changedFiles) store.setFileHash(file, "");
  lose("ast-grep stage", "write", astGrepErrors);
  timings["ast-grep"] = Math.round(performance.now() - astGrepStart);
  const coverageStart = performance.now();
  runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
  timings["coverage"] = Math.round(performance.now() - coverageStart);
  const gitStart = performance.now();
  lose("git stage", "write", await runGitCoChangeStage(store, projectRoot));
  timings["git"] = Math.round(performance.now() - gitStart);

  // This run's failures replace the last run's; a run that throws before here keeps the last run's, and one that
  // throws while replacing keeps more, as this run's go in before the last run's go out.
  const key = (f: FailedLookup) => `${f.source}\0${f.evidence}`;
  const now = new Set(lost.map(key));
  const before = store.getFailedLookups().filter((f) => f.kind === "index");
  for (const f of lost) store.setLookupFailed(f, true);
  for (const f of before) if (!now.has(key(f))) store.setLookupFailed(f, false);

  return { indexed, skipped, removed, errors, partial, timings };
}

// Back-compat with the existing placeholder export test
export const IndexPipeline = indexProject;
