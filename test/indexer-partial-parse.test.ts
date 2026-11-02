import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";
import { evaluateFreshness, formatFreshnessHeader } from "../src/output/freshness.js";
import { symbolGraphResult } from "../src/tools/symbol-graph.js";
import { traceResult } from "../src/tools/trace.js";

const noopClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

// `const broken = ;` is a syntax error tree-sitter recovers from; the declarations around it parse.
const BROKEN = "export function helper() { return 1; }\nconst broken = ;\nexport function caller() { return helper(); }\n";
const FIXED = BROKEN.replace("const broken = ;", "const broken = 2;");

test("extractFile keeps the declarations and calls of a file that parses with errors, marking it partial", () => {
  const result = extractFile("src/bad.ts", BROKEN);
  expect(result.partial).toBe(true);
  expect(result.nodes.map((n) => n.name)).toEqual(["helper", "caller"]);
  expect(result.edges.some((e) => e.kind === "calls" && e.source === "src/bad.ts::caller:3" && e.target.includes("::helper:"))).toBe(true);
  expect(extractFile("src/ok.ts", FIXED).partial).toBe(false);
});

test("indexProject lists a partially parsed file in partial, not errors, and a clean re-index clears it", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-partial-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "bad.ts"), BROKEN);
  writeFileSync(join(root, "src", "ok.ts"), "export function okFn() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    const first = await indexProject(root, store, { lspClientFactory: () => noopClient });
    expect(first.partial).toEqual(["src/bad.ts"]);
    expect(first.errors).toBe(0);

    const card = symbolGraphResult({ name: "caller", store, projectRoot: root }).text;
    expect(card).toContain("- partially parsed: src/bad.ts");
    expect(symbolGraphResult({ name: "okFn", store, projectRoot: root }).text).not.toContain("partially parsed");

    writeFileSync(join(root, "src", "bad.ts"), FIXED);
    const second = await indexProject(root, store, { lspClientFactory: () => noopClient });
    expect(second.partial).toEqual([]);
    expect(symbolGraphResult({ name: "caller", store, projectRoot: root }).text).not.toContain("partially parsed");
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a db indexed before file_hashes.partial re-extracts its unchanged files and rebuilds git co-change once", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-partial-upgrade-"));
  const files = ["src/bad.ts", "__tests__/bad.ts"];
  const dbPath = join(root, "graph.db");
  try {
    // The old extractor left a broken file module-only, its hash current, so the pipeline skips it.
    const old = new SqliteGraphStore(dbPath);
    for (const file of files) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), BROKEN);
      old.addNode(extractFile(file, BROKEN).module);
      old.setFileHash(file, sha256Hex(BROKEN));
    }
    old.setFileHash("__git_cochange_head__", "abc");
    old.close();
    const raw = new Database(dbPath);
    raw.run("ALTER TABLE file_hashes DROP COLUMN partial");
    raw.close();

    const store = new SqliteGraphStore(dbPath);
    try {
      // Re-extracting a file drops its git edges, so the git stage must run again too.
      expect(store.getFileHash("__git_cochange_head__")).toBe("");
      const result = await indexProject(root, store, { lspClientFactory: () => noopClient });
      expect(result.partial.sort()).toEqual(["__tests__/bad.ts", "src/bad.ts"]);
      expect(store.findNodes("caller")).toHaveLength(2);
    } finally {
      store.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the file_hashes.partial migration rolls back whole, so a failed one reruns on the next open", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-partial-atomic-"));
  const dbPath = join(root, "graph.db");
  try {
    const old = new SqliteGraphStore(dbPath);
    old.setFileHash("src/bad.ts", "h");
    old.close();
    const raw = new Database(dbPath);
    raw.run("ALTER TABLE file_hashes DROP COLUMN partial");
    raw.run("CREATE TRIGGER fail_update BEFORE UPDATE ON file_hashes BEGIN SELECT RAISE(ABORT, 'interrupted'); END");
    raw.close();

    expect(() => new SqliteGraphStore(dbPath)).toThrow(/interrupted/);
    const after = new Database(dbPath);
    expect((after.prepare("PRAGMA table_info(file_hashes)").all() as Array<{ name: string }>).map((c) => c.name)).not.toContain("partial");
    after.run("DROP TRIGGER fail_update");
    after.close();

    const store = new SqliteGraphStore(dbPath);
    expect(store.getFileHash("src/bad.ts")).toBe("");
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("trace's ambiguous-match output names the candidates' partially parsed files", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-partial-trace-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "bad.ts"), BROKEN);
  writeFileSync(join(root, "src", "ok.ts"), "export function caller() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, { lspClientFactory: () => noopClient });
    const text = traceResult({ entry: "caller", store, projectRoot: root }).text;
    expect(text).toContain("Multiple matches");
    expect(text).toContain("- partially parsed: src/bad.ts");
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("the partial-parse note names the target's file first, then the other touched partial files sorted", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-partial-order-"));
  mkdirSync(join(root, "src"), { recursive: true });
  const store = new SqliteGraphStore();
  try {
    const nodes = ["src/z.ts", "src/b.ts", "src/a.ts", "src/clean.ts"].map((file) => {
      const content = `export function f() {}\n// ${file}\n`;
      writeFileSync(join(root, file), content);
      store.setFileHash(file, sha256Hex(content), file !== "src/clean.ts");
      return { id: `${file}::f:1`, kind: "function" as const, name: "f", file, start_line: 1, end_line: 1, content_hash: sha256Hex(content) };
    });
    store.markCoverageIndexed();
    const [z, b, a, clean] = nodes;
    const header = formatFreshnessHeader(evaluateFreshness({ store, projectRoot: root, targetNodes: [z!], resultNodes: [b!, a!, clean!] }));
    expect(header).toBe("Trust: fresh\n- partially parsed: src/z.ts, src/a.ts, src/b.ts");
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
