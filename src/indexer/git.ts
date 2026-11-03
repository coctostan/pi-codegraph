import { execSync } from "node:child_process";
import { GIT_HEAD_KEY } from "../graph/sqlite.js";
import type { GraphStore } from "../graph/store.js";
import type { GraphEdge } from "../graph/types.js";
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

/** A co-change edge, stamped with its source module's content hash. */
function coChangeEdge(source: string, target: string, confidence: number, evidence: string, contentHash: string): GraphEdge {
  return {
    source,
    target,
    kind: "co_changes_with",
    provenance: { source: "git", confidence, evidence, content_hash: contentHash },
    created_at: Date.now(),
  };
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
  if (lastHead === head) {
    // Re-extraction keeps a module's git edges: restamp those whose source module changed, as a run here would write them.
    const stale = store.queryRows<{ source: string; target: string; confidence: number; evidence: string; hash: string }>(
      "SELECT e.source, e.target, e.confidence, e.evidence, n.content_hash AS hash FROM edges e JOIN nodes n ON n.id = e.source WHERE e.provenance_source = 'git' AND e.content_hash <> n.content_hash",
    );
    for (const e of stale) {
      try {
        store.addEdge(coChangeEdge(e.source, e.target, e.confidence, e.evidence, e.hash));
      } catch {
        errors++;
      }
    }
    return errors;
  }
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
      store.addEdge(coChangeEdge(nodeA.id, nodeB.id, Math.min(0.9, 0.3 + data.count * 0.1), evidence, nodeA.content_hash));
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
