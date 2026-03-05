import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { GraphStore } from "../graph/store.js";
import { extractFile, sha256Hex } from "./tree-sitter.js";

export interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
}

function toPosixPath(p: string): string {
  return p.split(sep).join("/");
}

function walkTsFiles(root: string): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules") continue;
      const full = join(dir, ent.name);

      if (ent.isDirectory()) {
        walk(full);
        continue;
      }

      if (ent.isFile() && ent.name.endsWith(".ts")) {
        out.push(full);
      }
    }
  };

  walk(root);
  return out;
}

export function indexProject(projectRoot: string, store: GraphStore): IndexResult {
  const files = walkTsFiles(projectRoot);

  let indexed = 0;
  let skipped = 0;
  let removed = 0;
  let errors = 0;

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
      indexed++;
    } catch {
      errors++;
    }
  }

  for (const oldFile of store.listFiles()) {
    if (currentRel.has(oldFile)) continue;
    try {
      store.deleteFile(oldFile);
      removed++;
    } catch {
      errors++;
    }
  }

  return { indexed, skipped, removed, errors };
}

// Back-compat with the existing placeholder export test
export const IndexPipeline = indexProject;
