import { expect, test, describe } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runGitCoChangeStage } from "../src/indexer/git.js";
import type { GraphEdge } from "../src/graph/types.js";

function initGitRepo(dir: string): void {
  execSync("git init -q", { cwd: dir });
  execSync("git config user.email pi@test.local", { cwd: dir });
  execSync("git config user.name PiTest", { cwd: dir });
}

function commit(dir: string, files: Array<{ path: string; content: string }>, message: string): void {
  for (const f of files) {
    const full = join(dir, f.path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, f.content);
  }
  execSync("git add -A", { cwd: dir });
  execSync(`git commit -q -m "${message}"`, { cwd: dir });
}

describe("RC-A/git: runGitCoChangeStage writes are guarded", () => {
  test("addEdge throw during co-change write does not abort the stage", async () => {
    const dir = join(tmpdir(), `pi-cg-git-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    try {
      initGitRepo(dir);
      // Three files that co-change twice → three pairs.
      commit(dir, [
        { path: "src/a.ts", content: "export const a = 1;\n" },
        { path: "src/b.ts", content: "export const b = 1;\n" },
        { path: "src/c.ts", content: "export const c = 1;\n" },
      ], "first");
      commit(dir, [
        { path: "src/a.ts", content: "export const a = 2;\n" },
        { path: "src/b.ts", content: "export const b = 2;\n" },
        { path: "src/c.ts", content: "export const c = 2;\n" },
      ], "second");

      const store = new SqliteGraphStore(join(dir, "graph.db"));
      // Pre-populate nodes so findNodes(file) returns hits.
      for (const rel of ["src/a.ts", "src/b.ts", "src/c.ts"]) {
        store.addNode({
          id: `${rel}::__module__`, kind: "module", name: rel,
          file: rel, start_line: 1, end_line: 1, content_hash: "h", is_exported: false,
        });
        store.setFileHash(rel, "h");
      }

      // Force the first co-change addEdge to throw.
      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let coChangeCalls = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.kind === "co_changes_with" && edge.provenance.source === "git") {
          coChangeCalls++;
          if (coChangeCalls === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      try {
        await runGitCoChangeStage(store, dir);
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      // All three pairs were attempted.
      expect(coChangeCalls).toBe(3);
      // At least one co_changes_with edge was persisted (from the pairs after the failure).
      const coEdges = store.queryRows<{ source: string; target: string }>(
        "SELECT source, target FROM edges WHERE kind = 'co_changes_with' AND provenance_source = 'git'",
      );
      expect(coEdges.length).toBeGreaterThanOrEqual(2);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
