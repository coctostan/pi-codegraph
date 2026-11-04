import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting, setIndexProjectForTesting, setTsServerClientFactoryForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const quiet: ITsServerClient = {
  definition: async () => null,
  references: async () => [],
  implementations: async () => [],
  shutdown: async () => {},
};

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** `readonly` locks `graph.db` and `.codegraph/`, `readonly-file` the db alone; `wal-readonly` keeps the index in `-wal` only. */
type Lock = "readonly" | "readonly-file" | "legacy-readonly" | "wal-readonly" | "unreadable";

/** A repo indexed once, then `fresh2` added and its db locked as `lock` says; returns the db's path. */
async function lockedRepo(lock: Lock): Promise<{ root: string; dbPath: string }> {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-readonly-copy-"));
  const dbDir = join(root, ".codegraph");
  const dbPath = join(dbDir, "graph.db");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(dbDir);
  writeFileSync(join(root, "src", "a.ts"), "export function alpha() {}\nexport function beta() { alpha(); }\n");
  // A WAL db is copied while `raw` holds it open, so closing the store neither checkpoints nor deletes its `-wal`.
  const staged = lock === "wal-readonly" ? join(mkdtempSync(join(tmpdir(), "pi-cg-wal-")), "graph.db") : dbPath;
  const { Database } = createRequire(import.meta.url)("bun:sqlite");
  const raw = new Database(staged);
  if (lock === "wal-readonly") raw.exec("PRAGMA journal_mode=WAL");
  const store = new SqliteGraphStore(staged);
  await indexProject(root, store, { lspClientFactory: () => quiet });
  store.close();
  if (lock === "legacy-readonly") raw.exec("DROP TABLE graph_metadata; DROP TABLE failed_lookups;");
  const suffixes = lock === "wal-readonly" ? ["", "-wal", "-shm"] : [""];
  if (lock === "wal-readonly") for (const suffix of suffixes) copyFileSync(staged + suffix, dbPath + suffix);
  raw.close();
  appendFileSync(join(root, "src", "a.ts"), "export function fresh2() {}\n");
  for (const suffix of suffixes) chmodSync(dbPath + suffix, lock === "unreadable" ? 0o000 : 0o444);
  if (lock !== "readonly-file") chmodSync(dbDir, 0o555);
  cleanup = () => {
    resetStoreForTesting();
    chmodSync(dbDir, 0o755);
    rmSync(root, { recursive: true, force: true });
    if (staged !== dbPath) rmSync(join(staged, ".."), { recursive: true, force: true });
  };
  return { root, dbPath };
}

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** The extension on a mock pi: its `symbol_graph`, `/codegraph status` and `session_shutdown`. */
function loadExtension(root: string) {
  resetStoreForTesting();
  setTsServerClientFactoryForTesting(() => quiet);
  const tools = new Map<string, { execute: Function }>();
  const handlers = new Map<string, Function>();
  let command: { handler: Function } | undefined;
  piCodegraph({
    registerTool: (tool: { name: string; execute: Function }) => tools.set(tool.name, tool),
    registerCommand: (_name: string, spec: { handler: Function }) => (command = spec),
    on: (event: string, handler: Function) => handlers.set(event, handler),
  } as any);
  return {
    symbolGraph: async (name: string) => {
      const out = await tools.get("symbol_graph")!.execute("c1", { name }, undefined, undefined, { cwd: root });
      return { text: out.content[0].text as string, isError: out.isError as boolean };
    },
    status: async () => {
      let text = "";
      await command!.handler("status", { cwd: root, hasUI: false, ui: { notify: (t: string) => (text = t) } });
      return text;
    },
    shutdown: () => handlers.get("session_shutdown")!(),
  };
}

for (const lock of ["readonly", "readonly-file", "legacy-readonly"] as const) {
  test(`a ${lock} graph.db is indexed on a temp copy, left as it was, and the copy goes at shutdown`, async () => {
    const { root, dbPath } = await lockedRepo(lock);
    const before = sha256(dbPath);
    const ext = loadExtension(root);

    const { text, isError } = await ext.symbolGraph("fresh2");
    expect(isError, text).toBe(false);
    expect(text).toStartWith("Trust: fresh\n");
    expect(text).not.toContain("indexing-failed");

    const status = await ext.status();
    const copy = /^db: a temp copy at (\S+), since codegraph can't write \.codegraph\/graph\.db$/m.exec(status)?.[1];
    expect(copy, status).toBeDefined();
    expect(existsSync(copy!)).toBe(true);
    expect(sha256(dbPath)).toBe(before);

    await ext.shutdown();
    expect(existsSync(copy!)).toBe(false);
  });
}

test("a read-only graph.db's -wal and -shm are copied with it", async () => {
  const { root } = await lockedRepo("wal-readonly");
  const ext = loadExtension(root);
  // Skip indexing, so `alpha` resolves only from the index the copied `-wal` holds.
  setIndexProjectForTesting(async () => ({ indexed: 0, skipped: 0, removed: 0, errors: 0, partial: [], timings: {} }));

  const { text, isError } = await ext.symbolGraph("alpha");
  expect(isError, text).toBe(false);
  expect(await ext.status()).toContain("db: a temp copy at ");
});

test("a graph.db codegraph can't read or copy is indexed in memory", async () => {
  const { root } = await lockedRepo("unreadable");
  const ext = loadExtension(root);

  const { text, isError } = await ext.symbolGraph("fresh2");
  expect(isError, text).toBe(false);
  expect(text).toStartWith("Trust: fresh\n");
  expect(await ext.status()).toContain("db: in memory, since codegraph can't write or copy .codegraph/graph.db");
});

test("a writable graph.db is indexed in place, its status naming no copy", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-readonly-copy-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export function fresh2() {}\n");
  cleanup = () => {
    resetStoreForTesting();
    rmSync(root, { recursive: true, force: true });
  };
  const ext = loadExtension(root);

  expect((await ext.symbolGraph("fresh2")).isError).toBe(false);
  expect(existsSync(join(root, ".codegraph", "graph.db"))).toBe(true);
  expect(await ext.status()).not.toContain("db: ");
});
