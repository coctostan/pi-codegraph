import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting, setTsServerClientFactoryForTesting } from "../src/index.js";
import { SCHEMA_VERSION, SqliteGraphStore } from "../src/graph/sqlite.js";
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

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** A repo indexed once, its `schema_version` then set to `version` (a newer codegraph's by default; null drops the table, as before it existed), and `fresh2` added. */
async function newerIndexRepo(version: number | null = SCHEMA_VERSION + 1): Promise<{ root: string; dbPath: string }> {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-newer-index-"));
  const dbPath = join(root, ".codegraph", "graph.db");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, ".codegraph"));
  writeFileSync(join(root, "src", "a.ts"), "export function alpha() {}\nexport function beta() { alpha(); }\n");
  const store = new SqliteGraphStore(dbPath);
  await indexProject(root, store, { lspClientFactory: () => quiet });
  store.close();
  const { Database } = createRequire(import.meta.url)("bun:sqlite");
  const raw = new Database(dbPath);
  if (version === null) raw.exec("DROP TABLE schema_version");
  else raw.prepare("UPDATE schema_version SET version = ?").run(version);
  raw.close();
  appendFileSync(join(root, "src", "a.ts"), "export function fresh2() {}\n");
  cleanup = () => {
    resetStoreForTesting();
    rmSync(root, { recursive: true, force: true });
  };
  return { root, dbPath };
}

/** The extension on a mock pi: its three tools, `/codegraph status` and `session_shutdown`. */
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
  const call = async (tool: string, params: object) => {
    const out = await tools.get(tool)!.execute("c1", params, undefined, undefined, { cwd: root });
    return { text: out.content[0].text as string, isError: out.isError as boolean };
  };
  return {
    call,
    symbolGraph: (name: string) => call("symbol_graph", { name }),
    status: async () => {
      let text = "";
      await command!.handler("status", { cwd: root, hasUI: false, ui: { notify: (t: string) => (text = t) } });
      return text;
    },
    shutdown: () => handlers.get("session_shutdown")!(),
  };
}

test("a graph.db a newer codegraph wrote keeps its bytes through a tool call over an edited tree, answered from a temp copy", async () => {
  const { root, dbPath } = await newerIndexRepo();
  const before = sha256(dbPath);
  const ext = loadExtension(root);

  const { text, isError } = await ext.symbolGraph("fresh2");
  expect(isError, text).toBe(false);
  expect(sha256(dbPath)).toBe(before);

  const status = await ext.status();
  const copy = /^db: a temp copy at (\S+), since a newer codegraph wrote \.codegraph\/graph\.db$/m.exec(status)?.[1];
  expect(copy, status).toBeDefined();
  await ext.shutdown();
  expect(existsSync(copy!)).toBe(false);
  expect(sha256(dbPath)).toBe(before);
});

const GAP_LINES = [
  `- index version: ${SCHEMA_VERSION + 1}, written by a newer codegraph than this one (${SCHEMA_VERSION})`,
  "- recommendation: restart pi to load the newer codegraph that wrote this index",
];

test("every tool's answer over a graph.db a newer codegraph wrote, a miss included, reads stale, naming both versions and a restart", async () => {
  const { root } = await newerIndexRepo();
  const ext = loadExtension(root);
  const calls: Array<[string, object]> = [
    ["symbol_graph", { name: "fresh2" }],
    ["symbol_graph", { name: "noSuchSymbol" }],
    ["impact", { symbols: ["alpha"], changeType: "behavior_change" }],
    ["trace", { entry: "beta" }],
    ["trace", { file: "src/a.ts", line: 2 }],
  ];
  for (const [tool, params] of calls) {
    const { text } = await ext.call(tool, params);
    const lines = text.split("\n");
    expect(lines[0], `${tool} ${JSON.stringify(params)}\n${text}`).toBe("Trust: stale");
    for (const line of GAP_LINES) expect(lines, `${tool} ${JSON.stringify(params)}\n${text}`).toContain(line);
  }
});

test("a graph.db a newer codegraph writes mid-session keeps its bytes through the next call over an edited tree, which reads stale", async () => {
  const { root, dbPath } = await newerIndexRepo(SCHEMA_VERSION);
  const ext = loadExtension(root);
  expect((await ext.symbolGraph("fresh2")).text).toStartWith("Trust: fresh");
  expect(await ext.status()).not.toContain("db: ");

  const { Database } = createRequire(import.meta.url)("bun:sqlite");
  const newer = new Database(dbPath);
  newer.prepare("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION + 1);
  newer.close();
  appendFileSync(join(root, "src", "a.ts"), "export function fresh3() {}\n");
  const before = sha256(dbPath);

  const { text, isError } = await ext.symbolGraph("fresh3");
  expect(isError, text).toBe(false);
  expect(sha256(dbPath)).toBe(before);
  expect(text.split("\n")[0], text).toBe("Trust: stale");
  for (const line of GAP_LINES) expect(text.split("\n")).toContain(line);
  const copyLine = /^db: a temp copy at \S+, since a newer codegraph wrote \.codegraph\/graph\.db$/m;
  const copy = copyLine.exec(await ext.status())?.[0];
  expect(copy).toBeDefined();
  // The next call keeps that copy rather than making another.
  await ext.symbolGraph("fresh3");
  expect(copyLine.exec(await ext.status())?.[0]).toBe(copy);
  await ext.shutdown();
  expect(sha256(dbPath)).toBe(before);
});

test("a graph.db whose version codegraph can't read, a writer holding it locked, keeps its bytes", async () => {
  const { root, dbPath } = await newerIndexRepo();
  const before = sha256(dbPath);
  const { Database } = createRequire(import.meta.url)("bun:sqlite");
  const writer = new Database(dbPath);
  writer.exec("BEGIN EXCLUSIVE");
  const ext = loadExtension(root);

  const { text, isError } = await ext.symbolGraph("fresh2");
  writer.exec("ROLLBACK");
  writer.close();
  expect(isError, text).toBe(false);
  // Its copy holds the newer version, so the answer still reads the gap.
  expect(text.split("\n")).toContain(GAP_LINES[0]!);
  expect(await ext.status()).toMatch(/^db: a temp copy at \S+, since codegraph can't read the version in \.codegraph\/graph\.db$/m);
  expect(sha256(dbPath)).toBe(before);
}, 15_000);

for (const [label, version] of [["at the code's own version", SCHEMA_VERSION], ["from before the version table", null]] as const) {
  test(`a graph.db ${label} is indexed in place`, async () => {
    const { root, dbPath } = await newerIndexRepo(version);
    const before = sha256(dbPath);
    const ext = loadExtension(root);

    const { text, isError } = await ext.symbolGraph("fresh2");
    expect(isError).toBe(false);
    expect(text).not.toMatch(/^Trust: stale|index version|restart pi/m);
    expect(await ext.status()).not.toContain("db: ");
    expect(sha256(dbPath)).not.toBe(before);
  });
}
