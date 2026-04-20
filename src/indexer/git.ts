import { execSync } from "node:child_process";
import type { GraphStore } from "../graph/store.js";

const GIT_HEAD_KEY = "__git_cochange_head__";

export interface GitCoChangeOptions {
  minCoChangeCount?: number;
  windowDays?: number;
}

interface CommitRecord {
  hash: string;
  dateIso: string;
  files: string[];
}

function parseGitLog(projectRoot: string): CommitRecord[] {
  let stdout: string;
  try {
    stdout = execSync(
      'git log --name-only --format="__COMMIT__%H %aI" --diff-filter=AMRT',
      {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    return [];
  }

  const records: CommitRecord[] = [];
  let current: CommitRecord | null = null;

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("__COMMIT__")) {
      if (current && current.files.length > 0) records.push(current);
      const rest = line.slice("__COMMIT__".length);
      const spaceIdx = rest.indexOf(" ");
      const hash = rest.slice(0, spaceIdx);
      const dateIso = rest.slice(spaceIdx + 1);
      current = { hash, dateIso, files: [] };
    } else if (current) {
      current.files.push(line.split("\\").join("/"));
    }
  }

  if (current && current.files.length > 0) records.push(current);

  return records;
}

function computeDecayWeight(commitDateIso: string, now: number, halfLifeDays: number): number {
  const commitTime = new Date(commitDateIso).getTime();
  const ageDays = (now - commitTime) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function getCurrentHead(projectRoot: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export async function runGitCoChangeStage(
  store: GraphStore,
  projectRoot: string,
  options: GitCoChangeOptions = {},
): Promise<number> {
  let errors = 0;
  const head = getCurrentHead(projectRoot);
  if (!head) return errors;
  const lastHead = store.getFileHash(GIT_HEAD_KEY);
  if (lastHead === head) return errors;
  const oldEdges = store.queryRows<{ source: string; target: string }>(
    "SELECT source, target FROM edges WHERE kind = 'co_changes_with' AND provenance_source = 'git'",
  );
  for (const edge of oldEdges) {
    try {
      store.deleteEdge(edge.source, edge.target, "co_changes_with", "git");
    } catch {
      errors++;
    }
  }
  const minCount = options.minCoChangeCount ?? 2;
  const windowDays = options.windowDays ?? 365;
  const commits = parseGitLog(projectRoot);
  if (commits.length === 0) {
    try {
      store.setFileHash(GIT_HEAD_KEY, head);
    } catch {
      errors++;
    }
    return errors;
  }
  const now = Date.now();
  const halfLifeDays = windowDays / 4;
  const trackedFiles = new Set(store.listFiles());
  const pairCounts = new Map<string, { count: number; weightedScore: number }>();
  for (const commit of commits) {
    const relevantFiles = commit.files.filter((f) => trackedFiles.has(f)).sort();
    if (relevantFiles.length < 2) continue;
    const weight = computeDecayWeight(commit.dateIso, now, halfLifeDays);
    for (let i = 0; i < relevantFiles.length; i++) {
      for (let j = i + 1; j < relevantFiles.length; j++) {
        const key = `${relevantFiles[i]}|${relevantFiles[j]}`;
        const existing = pairCounts.get(key) ?? { count: 0, weightedScore: 0 };
        existing.count++;
        existing.weightedScore += weight;
        pairCounts.set(key, existing);
      }
    }
  }
  for (const [key, data] of pairCounts) {
    if (data.count < minCount) continue;
    const [fileA, fileB] = key.split("|");
    const nodeA = store.findNodes(fileA!)[0];
    const nodeB = store.findNodes(fileB!)[0];
    if (!nodeA || !nodeB) continue;
    const evidence = `co_changes: ${data.count}, recency_score: ${data.weightedScore.toFixed(1)}, window: ${windowDays}d`;
    try {
      store.addEdge({
        source: nodeA.id,
        target: nodeB.id,
        kind: "co_changes_with",
        provenance: {
          source: "git",
          confidence: Math.min(0.9, 0.3 + data.count * 0.1),
          evidence,
          content_hash: nodeA.content_hash,
        },
        created_at: Date.now(),
      });
    } catch {
      errors++;
    }
  }

  try {
    store.setFileHash(GIT_HEAD_KEY, head);
  } catch {
    errors++;
  }
  return errors;
}
