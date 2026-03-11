import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("runGitCoChangeStage completes without error in a non-git directory", async () => {
  const root = join(tmpdir(), `pi-codegraph-no-git-${Date.now()}`);
  mkdirSync(root, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    // Should not throw
    await runGitCoChangeStage(store, root);

    // Should create no edges
    const edges = store.queryRows<{ source: string }>(
      "SELECT source FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(edges).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runGitCoChangeStage completes without error in a git repo with no commits", async () => {
  const root = join(tmpdir(), `pi-codegraph-empty-git-${Date.now()}`);
  mkdirSync(root, { recursive: true });

  execSync("git init", { cwd: root, stdio: "ignore" });

  const store = new SqliteGraphStore();
  try {
    const { runGitCoChangeStage } = await import("../src/indexer/git.js");

    await runGitCoChangeStage(store, root);

    const edges = store.queryRows<{ source: string }>(
      "SELECT source FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(edges).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runGitCoChangeStage suppresses git CLI noise for non-git and empty repos", () => {
  const noGitRoot = join(tmpdir(), `pi-codegraph-no-git-stderr-${Date.now()}`);
  mkdirSync(noGitRoot, { recursive: true });

  const emptyGitRoot = join(tmpdir(), `pi-codegraph-empty-git-stderr-${Date.now()}`);
  mkdirSync(emptyGitRoot, { recursive: true });
  execSync("git init", { cwd: emptyGitRoot, stdio: "ignore" });

  try {
    const script = `
      import { SqliteGraphStore } from "${process.cwd()}/src/graph/sqlite.js";
      import { runGitCoChangeStage } from "${process.cwd()}/src/indexer/git.js";
      const s1 = new SqliteGraphStore();
      await runGitCoChangeStage(s1, ${JSON.stringify(noGitRoot)});
      s1.close();
      const s2 = new SqliteGraphStore();
      await runGitCoChangeStage(s2, ${JSON.stringify(emptyGitRoot)});
      s2.close();
    `;

    const result = spawnSync(process.execPath, ["--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect((result.stderr ?? "").trim()).toBe("");
  } finally {
    rmSync(noGitRoot, { recursive: true, force: true });
    rmSync(emptyGitRoot, { recursive: true, force: true });
  }
});
