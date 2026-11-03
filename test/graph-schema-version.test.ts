import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { GIT_HEAD_METADATA_KEY, SCHEMA_VERSION, SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

function withDb(fn: (dbPath: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-schema-version-"));
  try {
    fn(join(root, "graph.db"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function seed(dbPath: string, sql: string[]): void {
  const old = new SqliteGraphStore(dbPath);
  old.setFileHash("src/x.ts", "h");
  old.setMetadata(GIT_HEAD_METADATA_KEY, "abc");
  old.close();
  const raw = new Database(dbPath);
  for (const statement of sql) raw.run(statement);
  raw.close();
}

function readVersions(dbPath: string): unknown {
  const raw = new Database(dbPath);
  try {
    return raw.prepare("SELECT version FROM schema_version").all();
  } finally {
    raw.close();
  }
}

test("a db at SCHEMA_VERSION gains a missing partial or call_end column without re-extracting", () => {
  withDb((dbPath) => {
    seed(dbPath, [
      "ALTER TABLE file_hashes DROP COLUMN partial",
      "ALTER TABLE edges DROP COLUMN call_end_line",
      "ALTER TABLE edges DROP COLUMN call_end_col",
    ]);
    const store = new SqliteGraphStore(dbPath);
    try {
      expect(store.getFileHash("src/x.ts")).toBe("h");
      expect(store.getMetadata(GIT_HEAD_METADATA_KEY)).toBe("abc");
      const columns = (table: string) => store.queryRows<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`).map((c) => c.name);
      expect(columns("file_hashes")).toContain("partial");
      expect(columns("edges")).toEqual(expect.arrayContaining(["call_end_line", "call_end_col"]));
    } finally {
      store.close();
    }
  });
});

test("a db above SCHEMA_VERSION, written by a newer release, keeps its hashes and its version", () => {
  withDb((dbPath) => {
    seed(dbPath, [`UPDATE schema_version SET version = ${SCHEMA_VERSION + 1}`]);
    const store = new SqliteGraphStore(dbPath);
    expect(store.getFileHash("src/x.ts")).toBe("h");
    expect(store.getMetadata(GIT_HEAD_METADATA_KEY)).toBe("abc");
    store.close();
    expect(readVersions(dbPath)).toEqual([{ version: SCHEMA_VERSION + 1 }]);
  });
});
for (const [label, sql] of [
  ["below SCHEMA_VERSION", [`UPDATE schema_version SET version = ${SCHEMA_VERSION - 1}`]],
  ["with no schema_version row", ["DELETE FROM schema_version"]],
] as const) {
  test(`a db ${label} re-extracts every file once, then keeps its hashes`, () => {
    withDb((dbPath) => {
      seed(dbPath, [...sql]);
      const upgraded = new SqliteGraphStore(dbPath);
      expect(upgraded.getFileHash("src/x.ts")).toBe("");
      expect(upgraded.getMetadata(GIT_HEAD_METADATA_KEY)).toBeNull();
      upgraded.setFileHash("src/x.ts", "h2");
      upgraded.close();

      const again = new SqliteGraphStore(dbPath);
      expect(again.getFileHash("src/x.ts")).toBe("h2");
      again.close();
      expect(readVersions(dbPath)).toEqual([{ version: SCHEMA_VERSION }]);
    });
  });
}

test("a version-2 db, written before index-parity (An incremental index matches a fresh one), re-extracts once", () => {
  withDb((dbPath) => {
    seed(dbPath, ["UPDATE schema_version SET version = 2"]);
    const store = new SqliteGraphStore(dbPath);
    expect(store.getFileHash("src/x.ts")).toBe("");
    expect(store.getMetadata(GIT_HEAD_METADATA_KEY)).toBeNull();
    store.close();
    expect(readVersions(dbPath)).toEqual([{ version: SCHEMA_VERSION }]);
  });
});

test("the re-extraction rolls back whole, so a failed one reruns on the next open", () => {
  withDb((dbPath) => {
    seed(dbPath, [
      `UPDATE schema_version SET version = ${SCHEMA_VERSION - 1}`,
      "CREATE TRIGGER fail_update BEFORE UPDATE ON file_hashes BEGIN SELECT RAISE(ABORT, 'interrupted'); END",
    ]);
    expect(() => new SqliteGraphStore(dbPath)).toThrow(/interrupted/);
    expect(readVersions(dbPath)).toEqual([{ version: SCHEMA_VERSION - 1 }]);
    const raw = new Database(dbPath);
    raw.run("DROP TRIGGER fail_update");
    raw.close();

    const store = new SqliteGraphStore(dbPath);
    expect(store.getFileHash("src/x.ts")).toBe("");
    store.close();
  });
});

// What extractFile writes for unchanged source, pinned to SCHEMA_VERSION: an index keeps a file's rows until its hash
// changes, so a new extractor output only reaches existing indexes through a bump.
const PIN_PATH = join(import.meta.dir, "fixtures", "schema-version", "extract-pin.json");
const REPIN = "UPDATE_EXTRACT_PIN";
const FIXTURE: Record<string, string> = {
  "src/fixture.ts": [
    'import { readFileSync } from "node:fs";',
    'import { helper, type Options } from "./helper";',
    'import * as ns from "./ns";',
    'import config from "./config";',
    "",
    "export interface Shape { area(): number }",
    "",
    "export class Circle implements Shape {",
    "  constructor(private r: number) {}",
    "  area(): number { return square(this.r) * Math.PI; }",
    "}",
    "",
    "function square(n: number): number { return n * n; }",
    "",
    "export const load = (path: string, options?: Options): string => {",
    "  const text = readFileSync(path, \"utf8\");",
    "  ns.log(helper(text, options));",
    "  return JSON.stringify(new Circle(square(2)));",
    "};",
    "",
    "export default function main() { load(config.path); missing(); }",
  ].join("\n"),
  "test/fixture.test.ts": [
    'import { expect, test } from "bun:test";',
    'import { load } from "../src/fixture";',
    "",
    'test("loads", () => {',
    '  expect(load("x")).toBe("{}");',
    "});",
  ].join("\n"),
  "src/broken.ts": "export function helper() { return 1; }\nconst broken = ;\nexport function caller() { return helper(); }\n",
};

function extractRows(): string[] {
  return Object.entries(FIXTURE).flatMap(([file, content]) => {
    const { module, nodes, edges, partial } = extractFile(file, content);
    return [
      `${file} partial=${partial}`,
      ...[module, ...nodes].map((node) => JSON.stringify(node)),
      ...edges.map(({ created_at: _, ...edge }) => JSON.stringify(edge)),
    ];
  });
}

interface Pin { schemaVersion: number; rows: string[] }

function pinVerdict(pin: Pin, version: number, rows: string[]): string | null {
  if (pin.schemaVersion !== version) {
    return `the pin is for schema_version ${pin.schemaVersion}, SCHEMA_VERSION is ${version}: re-pin with ${REPIN}=1 bun test test/graph-schema-version.test.ts`;
  }
  const at = rows.findIndex((row, i) => row !== pin.rows[i]);
  if (at === -1 && rows.length === pin.rows.length) return null;
  const index = at === -1 ? rows.length : at;
  return [
    `extractFile's output changed at schema_version ${version}, so existing indexes keep the old rows:`,
    `bump SCHEMA_VERSION in src/graph/sqlite.ts so they re-extract, then re-pin with ${REPIN}=1 bun test test/graph-schema-version.test.ts.`,
    `First difference, row ${index}:`,
    `  pinned: ${pin.rows[index] ?? "(none)"}`,
    `  now:    ${rows[index] ?? "(none)"}`,
  ].join("\n");
}

test("the pin fails on a changed extractor output, naming the bump", () => {
  const pin: Pin = { schemaVersion: SCHEMA_VERSION, rows: extractRows() };
  const perturbed = pin.rows.map((row, i) => (i === 3 ? row.replace(/"start_line":\d+/, '"start_line":99') : row));
  expect(pinVerdict(pin, SCHEMA_VERSION, perturbed)).toContain("bump SCHEMA_VERSION in src/graph/sqlite.ts");
  expect(pinVerdict(pin, SCHEMA_VERSION, pin.rows.slice(1))).toContain("bump SCHEMA_VERSION");
  expect(pinVerdict(pin, SCHEMA_VERSION, [...pin.rows, "extra"])).toContain("bump SCHEMA_VERSION");
  expect(pinVerdict(pin, SCHEMA_VERSION + 1, pin.rows)).toContain(`re-pin with ${REPIN}=1`);
  expect(pinVerdict(pin, SCHEMA_VERSION, pin.rows)).toBeNull();
});

test("extractFile's output on the fixture is pinned to SCHEMA_VERSION", () => {
  const rows = extractRows();
  const pin = existsSync(PIN_PATH) ? (JSON.parse(readFileSync(PIN_PATH, "utf8")) as Pin) : null;
  // Re-pinning is open only to a new SCHEMA_VERSION: at the pinned one, a changed output must bump it first.
  if (process.env[REPIN] && (!pin || pin.schemaVersion < SCHEMA_VERSION)) {
    mkdirSync(dirname(PIN_PATH), { recursive: true });
    writeFileSync(PIN_PATH, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, rows }, null, 2)}\n`);
    return;
  }
  if (!pin) throw new Error(`no pin at ${PIN_PATH}: write it with ${REPIN}=1 bun test test/graph-schema-version.test.ts`);
  const verdict = pinVerdict(pin, SCHEMA_VERSION, rows);
  if (verdict) throw new Error(verdict);
});
