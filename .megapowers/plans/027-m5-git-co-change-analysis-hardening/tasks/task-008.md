---
id: 8
title: Git co-change log parsing and co-occurrence matrix
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - test/indexer-git-cochange.test.ts
---

**AC:** 1 (git log parsing), 3 (commit age weighting), 4 (evidence format), 5 (minimum threshold)

**Files:**
- Create: `src/indexer/git.ts`
- Test: `test/indexer-git-cochange.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-git-cochange.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";

function createTestRepo(): string {
  const root = join(tmpdir(), `pi-codegraph-git-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });

  execSync("git init", { cwd: root, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: root, stdio: "ignore" });

  // Commit 1: a.ts + b.ts change together
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 1;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "commit1"', { cwd: root, stdio: "ignore" });

  // Commit 2: a.ts + b.ts change together again
  writeFileSync(join(root, "src", "a.ts"), "export const a = 2;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 2;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "commit2"', { cwd: root, stdio: "ignore" });

  // Commit 3: a.ts + c.ts (only once together — below threshold)
  writeFileSync(join(root, "src", "a.ts"), "export const a = 3;");
  writeFileSync(join(root, "src", "c.ts"), "export const c = 1;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "commit3"', { cwd: root, stdio: "ignore" });

  return root;
}

test("runGitCoChangeStage creates co_changes_with edges for file pairs exceeding threshold", async () => {
  const root = createTestRepo();
  const store = new SqliteGraphStore();
  try {
    // Add module nodes so edges have valid targets
    store.addNode({ id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1" });
    store.addNode({ id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2" });
    store.addNode({ id: nodeId("src/c.ts", "src/c.ts", 1), kind: "module", name: "src/c.ts", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: "h3" });
    store.setFileHash("src/a.ts", "h1");
    store.setFileHash("src/b.ts", "h2");
    store.setFileHash("src/c.ts", "h3");

    const { runGitCoChangeStage } = await import("../src/indexer/git.js");
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });

    // a.ts <-> b.ts co-changed 2 times (>= threshold) — should have edges
    const aId = nodeId("src/a.ts", "src/a.ts", 1);
    const bId = nodeId("src/b.ts", "src/b.ts", 1);

    const edges = store.queryRows<{ source: string; target: string; kind: string; provenance_source: string; evidence: string }>(
      "SELECT source, target, kind, provenance_source, evidence FROM edges WHERE kind = 'co_changes_with'"
    );

    // Should have edge between a and b (one direction or both)
    const abEdge = edges.find((e) => (e.source === aId && e.target === bId) || (e.source === bId && e.target === aId));
    expect(abEdge).toBeDefined();
    expect(abEdge!.provenance_source).toBe("git");

    // Evidence should contain co_changes count, recency_score, and window
    expect(abEdge!.evidence).toContain("co_changes:");
    expect(abEdge!.evidence).toContain("recency_score:");
    expect(abEdge!.evidence).toContain("window:");

    // a.ts <-> c.ts only co-changed once (< threshold) — no edge
    const cId = nodeId("src/c.ts", "src/c.ts", 1);
    const acEdge = edges.find((e) => (e.source === aId && e.target === cId) || (e.source === cId && e.target === aId));
    expect(acEdge).toBeUndefined();
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runGitCoChangeStage applies recency weighting (recent commits count more)", async () => {
  const root = createTestRepo();
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1" });
    store.addNode({ id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2" });
    store.setFileHash("src/a.ts", "h1");
    store.setFileHash("src/b.ts", "h2");

    const { runGitCoChangeStage } = await import("../src/indexer/git.js");
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });

    const edges = store.queryRows<{ evidence: string }>(
      "SELECT evidence FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(edges.length).toBeGreaterThan(0);

    // Parse recency_score from evidence — it should be > 0 (recent commits have weight)
    const match = edges[0]!.evidence.match(/recency_score:\s*([\d.]+)/);
    expect(match).toBeTruthy();
    expect(parseFloat(match![1])).toBeGreaterThan(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-git-cochange.test.ts`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'runGitCoChangeStage')` or module not found error, since `src/indexer/git.ts` doesn't exist yet.

**Step 3 — Write minimal implementation**

Create `src/indexer/git.ts`:

```ts
import { execSync } from "node:child_process";
import type { GraphStore } from "../graph/store.js";
import { nodeId } from "../graph/types.js";

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
      { cwd: projectRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
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

export async function runGitCoChangeStage(
  store: GraphStore,
  projectRoot: string,
  options: GitCoChangeOptions = {},
): Promise<void> {
  const minCount = options.minCoChangeCount ?? 2;
  const windowDays = options.windowDays ?? 365;

  const commits = parseGitLog(projectRoot);
  if (commits.length === 0) return;

  const now = Date.now();
  const halfLifeDays = windowDays / 4; // half-life at 1/4 of window

  // Filter to tracked files
  const trackedFiles = new Set(store.listFiles());

  // Build co-occurrence matrix
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

  // Create edges for pairs exceeding threshold
  for (const [key, data] of pairCounts) {
    if (data.count < minCount) continue;
    const [fileA, fileB] = key.split("|");
    const nodeA = store.findNodes(fileA!)[0];
    const nodeB = store.findNodes(fileB!)[0];
    if (!nodeA || !nodeB) continue;

    const evidence = `co_changes: ${data.count}, recency_score: ${data.weightedScore.toFixed(1)}, window: ${windowDays}d`;

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
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-git-cochange.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
