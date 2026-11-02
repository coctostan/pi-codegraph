import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { GraphStore } from "../graph/store.js";
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
  // Git lists nothing when the root is a directory its repo ignores; index it as a plain tree.
  if (listed.length === 0) return walkTsFiles(root);
  // A Set drops the repeat an unmerged path gets per conflict stage; existsSync drops a tracked file deleted from disk.
  return [...new Set(listed)]
    .filter((rel) => (rel.endsWith(".ts") || rel.endsWith(".tsx")) && !rel.split("/").some((part) => SKIPPED_DIRS.has(part)))
    .map((rel) => join(root, rel))
    .filter((abs) => existsSync(abs));
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
  const partial: string[] = [];
  const changedFiles: string[] = [];

  const currentRel = new Set(files.map((absPath) => toPosixPath(relative(projectRoot, absPath))));
  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));
    try {
      const content = readFileSync(absPath, "utf8");
      const hash = sha256Hex(content);
      const existing = store.getFileHash(rel);
      if (existing === hash) {
        skipped++;
        continue;
      }
      if (existing !== null) {
        store.deleteFile(rel);
      }

      const extracted = extractFile(rel, content);
      store.addNode(extracted.module);
      for (const node of extracted.nodes) store.addNode(node);
      for (const edge of extracted.edges) store.addEdge(edge);
      store.setFileHash(rel, hash, extracted.partial);
      if (extracted.partial) partial.push(rel);
      changedFiles.push(rel);
      indexed++;
    } catch {
      errors++;
    }
  }

  for (const oldFile of store.listFiles()) {
    if (currentRel.has(oldFile) || oldFile.startsWith("__")) continue;
    try {
      store.deleteFile(oldFile);
      removed++;
    } catch {
      errors++;
    }
  }
  timings["tree-sitter"] = Math.round(performance.now() - tsStart);

  const lspStart = performance.now();
  const client = options.lspClientFactory ? options.lspClientFactory(projectRoot) : new TsServerClient(projectRoot);
  try {
    errors += await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  timings["lsp"] = Math.round(performance.now() - lspStart);
  const astGrepStart = performance.now();
  errors += await runAstGrepIndexStage(store, projectRoot, changedFiles);
  timings["ast-grep"] = Math.round(performance.now() - astGrepStart);
  const coverageStart = performance.now();
  runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
  timings["coverage"] = Math.round(performance.now() - coverageStart);
  const gitStart = performance.now();
  errors += await runGitCoChangeStage(store, projectRoot);
  timings["git"] = Math.round(performance.now() - gitStart);

  return { indexed, skipped, removed, errors, partial, timings };
}

// Back-compat with the existing placeholder export test
export const IndexPipeline = indexProject;
