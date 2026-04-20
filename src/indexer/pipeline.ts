import { readdirSync, readFileSync } from "node:fs";
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
  timings: Record<string, number>;
}

export interface IndexProjectOptions {
  lspClientFactory?: (projectRoot: string) => ITsServerClient;
  coverageDir?: string;
}

function toPosixPath(p: string): string {
  return p.split(sep).join("/");
}

function walkTsFiles(root: string): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === ".megapowers" || ent.name === ".git") continue;
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

export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult> {
  const timings: Record<string, number> = {};

  const tsStart = performance.now();
  const files = walkTsFiles(projectRoot);

  let indexed = 0;
  let skipped = 0;
  let removed = 0;
  let errors = 0;
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
      store.setFileHash(rel, hash);
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

  return { indexed, skipped, removed, errors, timings };
}

// Back-compat with the existing placeholder export test
export const IndexPipeline = indexProject;
