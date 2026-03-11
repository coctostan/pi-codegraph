import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";

function setupRepo(): string {
  const root = join(tmpdir(), `pi-codegraph-git-incr-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  execSync("git init", { cwd: root, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 1;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c1"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 2;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 2;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c2"', { cwd: root, stdio: "ignore" });

  return root;
}

function seedStore(store: SqliteGraphStore): void {
  store.addNode({ id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1" });
  store.addNode({ id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2" });
  store.setFileHash("src/a.ts", "h1");
  store.setFileHash("src/b.ts", "h2");
}

test("runGitCoChangeStage skips re-analysis when HEAD has not changed", async () => {
  const root = setupRepo();
  const store = new SqliteGraphStore();
  try {
    seedStore(store);
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    // First run: should create edges
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges1 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges1.length).toBeGreaterThan(0);

    // Delete the edges manually to detect if re-analysis happens
    store.queryRows("SELECT 1"); // no-op
    for (const e of store.queryRows<{ source: string; target: string; kind: string; provenance_source: string }>(
      "SELECT source, target, kind, provenance_source FROM edges WHERE kind = 'co_changes_with'"
    )) {
      store.deleteEdge(e.source, e.target, e.kind, e.provenance_source);
    }

    // Second run with same HEAD: should skip (edges stay deleted)
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges2 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges2.length).toBe(0); // Skipped — didn't re-create

  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runGitCoChangeStage clears and rebuilds when HEAD changes", async () => {
  const root = setupRepo();
  const store = new SqliteGraphStore();
  try {
    seedStore(store);
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges1 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges1.length).toBeGreaterThan(0);

    // Make a new commit to change HEAD
    writeFileSync(join(root, "src", "a.ts"), "export const a = 3;");
    writeFileSync(join(root, "src", "b.ts"), "export const b = 3;");
    execSync("git add .", { cwd: root, stdio: "ignore" });
    execSync('git commit -m "c3"', { cwd: root, stdio: "ignore" });

    // Run again — should clear old edges and rebuild
    await runGitCoChangeStage(store, root, { minCoChangeCount: 2 });
    const edges2 = store.queryRows<{ source: string }>("SELECT source FROM edges WHERE kind = 'co_changes_with'");
    expect(edges2.length).toBeGreaterThan(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
