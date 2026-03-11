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
