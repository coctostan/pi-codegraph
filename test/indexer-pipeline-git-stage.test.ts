import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const noopClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

test("indexProject runs git co-change stage and returns timings", async () => {
  const root = join(tmpdir(), `pi-codegraph-pipeline-git-${Date.now()}`);
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

  const store = new SqliteGraphStore();
  try {
    const result = await indexProject(root, store, { lspClientFactory: () => noopClient });

    // Result should have timings for all 5 stages
    expect(result.timings).toBeDefined();
    expect(typeof result.timings["tree-sitter"]).toBe("number");
    expect(typeof result.timings["lsp"]).toBe("number");
    expect(typeof result.timings["ast-grep"]).toBe("number");
    expect(typeof result.timings["coverage"]).toBe("number");
    expect(typeof result.timings["git"]).toBe("number");

    // All timings should be non-negative
    for (const [, ms] of Object.entries(result.timings)) {
      expect(ms).toBeGreaterThanOrEqual(0);
    }

    // Summary counts still present
    expect(result.indexed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.errors).toBe(0);

    // Git stage should have created co_changes_with edges
    const cochangeEdges = store.queryRows<{ kind: string }>(
      "SELECT kind FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(cochangeEdges.length).toBeGreaterThan(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
