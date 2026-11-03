import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_HEAD_METADATA_KEY, SqliteGraphStore } from "../src/graph/sqlite.js";
import { runGitCoChangeStage } from "../src/indexer/git.js";

/** Keys the index once kept in its content tables as sentinel rows. */
const SENTINELS = ["__git_cochange_head__"];

/** Every `nodes`, `edges` or `file_hashes` row naming a sentinel key. */
function sentinelRows(store: SqliteGraphStore): unknown[] {
  return SENTINELS.flatMap((key) => [
    ...store.queryRows("SELECT 'nodes' AS t, id AS k FROM nodes WHERE instr(id, ?) > 0 OR instr(file, ?) > 0", [key, key]),
    ...store.queryRows("SELECT 'edges' AS t, source AS k FROM edges WHERE instr(source, ?) > 0 OR instr(target, ?) > 0", [key, key]),
    ...store.queryRows("SELECT 'file_hashes' AS t, file AS k FROM file_hashes WHERE instr(file, ?) > 0", [key]),
  ]);
}

function withDir(fn: (dir: string) => void | Promise<void>): Promise<void> | void {
  const dir = mkdtempSync(join(tmpdir(), "pi-cg-metadata-sentinels-"));
  const done = () => {
    try { chmodSync(dir, 0o755); } catch {}
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    const result = fn(dir);
    if (result instanceof Promise) return result.finally(done);
    done();
  } catch (error) {
    done();
    throw error;
  }
}

/** A current-schema db whose git stage wrote its head as a `file_hashes` row, as before index-honesty (The index says when it lost data). */
function seedPreArcDb(dbPath: string): void {
  new SqliteGraphStore(dbPath).close();
  const raw = new Database(dbPath);
  raw.run("INSERT INTO file_hashes (file, hash, indexed_at, partial) VALUES ('src/x.ts', 'h', 1, 0), ('__git_cochange_head__', 'abc', 1, 0)");
  raw.close();
}

test("a db holding the git head as a file_hashes row moves it to graph_metadata on open", () => {
  withDir((dir) => {
    const dbPath = join(dir, "graph.db");
    seedPreArcDb(dbPath);
    const store = new SqliteGraphStore(dbPath);
    try {
      expect(sentinelRows(store)).toEqual([]);
      expect(store.getMetadata(GIT_HEAD_METADATA_KEY)).toBe("abc");
      expect(store.listFiles()).toEqual(["src/x.ts"]);
      expect(store.getFileHash("src/x.ts")).toBe("h");
    } finally {
      store.close();
    }
  });
});

test("the git stage keeps its head in graph_metadata, out of every content table", async () => {
  await withDir(async (dir) => {
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, stdio: "ignore" });
    git("init", "-q");
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
    git("add", ".");
    git("commit", "-qm", "a");
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    const store = new SqliteGraphStore();
    try {
      expect(await runGitCoChangeStage(store, dir)).toBe(0);
      expect(sentinelRows(store)).toEqual([]);
      expect(store.getMetadata(GIT_HEAD_METADATA_KEY)).toBe(head);
      expect(store.listFiles()).toEqual([]);
      expect(store.getStatistics(dir).files).toEqual({ total: 0, stale: 0 });
    } finally {
      store.close();
    }
  });
});

test("setMetadata with null deletes the key", () => {
  const store = new SqliteGraphStore();
  try {
    expect(store.getMetadata("k")).toBeNull();
    store.setMetadata("k", "v");
    expect(store.getMetadata("k")).toBe("v");
    store.setMetadata("k", null);
    expect(store.getMetadata("k")).toBeNull();
  } finally {
    store.close();
  }
});

/** A read-only pre-arc db, file and directory locked, so the open writes nothing. */
function withReadOnlyPreArcDb(fn: (dbPath: string) => void): void {
  withDir((dir) => {
    const dbPath = join(dir, "graph.db");
    seedPreArcDb(dbPath);
    chmodSync(dbPath, 0o444);
    chmodSync(dir, 0o555);
    try {
      fn(dbPath);
    } finally {
      chmodSync(dbPath, 0o644);
    }
  });
}

// Accepted limit: a read-only db can't move the row, so it opens as is and lists the row as a file.
test("a read-only pre-arc db opens as is", () => {
  withReadOnlyPreArcDb((dbPath) => {
    const store = new SqliteGraphStore(dbPath);
    try {
      expect(store.listFiles()).toEqual(["__git_cochange_head__", "src/x.ts"]);
    } finally {
      store.close();
    }
  });
});

// pi's host runs on Node, whose node:sqlite reports the read-only error in `errcode`, not Bun's `errno`.
test.skipIf(!Bun.which("node"))("a read-only pre-arc db opens as is under Node", () => {
  withReadOnlyPreArcDb((dbPath) => {
    const script = `const { SqliteGraphStore } = await import(process.argv[1]); const s = new SqliteGraphStore(process.argv[2]); console.log(JSON.stringify(s.listFiles())); s.close();`;
    const sqliteUrl = new URL("../src/graph/sqlite.ts", import.meta.url).href;
    const run = spawnSync("node", ["--input-type=module", "-e", script, sqliteUrl, dbPath], { encoding: "utf8" });
    expect(run.stderr).not.toContain("Error");
    expect(JSON.parse(run.stdout.trim())).toEqual(["__git_cochange_head__", "src/x.ts"]);
  });
});
