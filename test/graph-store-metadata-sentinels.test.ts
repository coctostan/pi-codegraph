import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_HEAD_METADATA_KEY, resolverMarkerKey, SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { runGitCoChangeStage } from "../src/indexer/git.js";
import { resolveImplementations, resolveMissingCallers } from "../src/indexer/lsp-resolver.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

/** Keys the index once kept in its content tables as sentinel rows. */
const SENTINELS = ["__git_cochange_head__", "__meta__"];

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

/**
 * A current-schema db holding, as before index-honesty (The index says when it lost data), the git head as a `file_hashes`
 * row and a resolver marker as a node with an edge into its symbol.
 */
function seedPreArcDb(dbPath: string): void {
  new SqliteGraphStore(dbPath).close();
  const raw = new Database(dbPath);
  raw.run("INSERT INTO file_hashes (file, hash, indexed_at, partial) VALUES ('src/x.ts', 'h', 1, 0), ('__git_cochange_head__', 'abc', 1, 0)");
  raw.run("INSERT INTO nodes (id, kind, name, file, start_line, end_line, content_hash) VALUES ('src/x.ts::x:1', 'function', 'x', 'src/x.ts', 1, 1, 'h'), ('__meta__::resolver::callers::src/x.ts::x:1', 'module', '__meta__::resolver::callers::src/x.ts::x:1', '__meta__/resolver', 1, 1, 'meta')");
  raw.run("INSERT INTO edges (source, target, kind, provenance_source, confidence, evidence, content_hash, created_at) VALUES ('__meta__::resolver::callers::src/x.ts::x:1', 'src/x.ts::x:1', 'imports', 'lsp', 1, 'resolved:callers', 'meta', 1)");
  raw.close();
}

test("a db from before the arc moves the git head to graph_metadata and drops its resolver markers on open", () => {
  withDir((dir) => {
    const dbPath = join(dir, "graph.db");
    seedPreArcDb(dbPath);
    const store = new SqliteGraphStore(dbPath);
    try {
      expect(sentinelRows(store)).toEqual([]);
      expect(store.getMetadata(GIT_HEAD_METADATA_KEY)).toBe("abc");
      expect(store.listFiles()).toEqual(["src/x.ts"]);
      expect(store.getFileHash("src/x.ts")).toBe("h");
      expect(store.getNodesByFile("src/x.ts").map((n) => n.id)).toEqual(["src/x.ts::x:1"]);
    } finally {
      store.close();
    }
  });
});

test("the resolver keeps its markers in graph_metadata, out of every content table", async () => {
  const store = new SqliteGraphStore();
  try {
    const node: GraphNode = { id: "src/x.ts::x:1", kind: "interface", name: "x", file: "src/x.ts", start_line: 1, end_line: 1, content_hash: "h" };
    store.addNode(node);
    const asked: string[] = [];
    const client: ITsServerClient = {
      async definition() { return null; },
      async references() { asked.push("references"); return []; },
      async implementations() { asked.push("implementations"); return []; },
      async shutdown() {},
    };
    for (let run = 0; run < 2; run++) {
      await resolveMissingCallers(node, store, "/nowhere", client);
      await resolveImplementations(node, store, "/nowhere", client);
    }
    expect(asked).toEqual(["references", "implementations"]);
    expect(sentinelRows(store)).toEqual([]);
    expect(store.queryRows("SELECT id FROM nodes")).toEqual([{ id: node.id }]);
    expect(store.queryRows("SELECT 1 FROM edges")).toEqual([]);
    expect(store.getMetadata(resolverMarkerKey("callers", node.id))).toBe("1");
    expect(store.getMetadata(resolverMarkerKey("implementations", node.id))).toBe("1");
  } finally {
    store.close();
  }
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

// Accepted limit: a read-only db can't move the row or drop the markers, so it opens as is, listing the row as a file.
test("a read-only pre-arc db opens as is", () => {
  withReadOnlyPreArcDb((dbPath) => {
    const store = new SqliteGraphStore(dbPath);
    try {
      expect(store.listFiles()).toEqual(["__git_cochange_head__", "src/x.ts"]);
      expect(store.queryRows("SELECT id FROM nodes WHERE content_hash = 'meta'")).toHaveLength(1);
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
