import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runCoverageIndexStage } from "../src/indexer/coverage.js";
import { indexProject } from "../src/indexer/pipeline.js";

const SOURCE = "export function f() { return 1; }\n";

function withProject(run: (projectRoot: string, coverageDir: string, store: SqliteGraphStore) => void): void {
  const projectRoot = mkdtempSync(join(tmpdir(), "pi-cg-covsentinel-"));
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "a.ts"), SOURCE);
  const store = new SqliteGraphStore();
  store.addNode({ id: "src/a.ts::f:1", kind: "function", name: "f", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
  try {
    run(projectRoot, coverageDir, store);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function writeReport(projectRoot: string, coverageDir: string, file: string): void {
  mkdirSync(coverageDir, { recursive: true });
  const url = new URL(`file://${join(projectRoot, file)}`).href;
  const functions = [{ functionName: "f", ranges: [{ startOffset: 0, endOffset: SOURCE.length, count: 1 }] }];
  writeFileSync(join(coverageDir, "report.json"), JSON.stringify({ result: [{ url, functions }] }));
}

test("no coverage dir leaves coverage unknown", () => {
  withProject((projectRoot, coverageDir, store) => {
    runCoverageIndexStage(store, projectRoot, coverageDir);
    expect(store.hasCoverageData()).toBe(false);
  });
});

test("an empty coverage dir leaves coverage unknown", () => {
  withProject((projectRoot, coverageDir, store) => {
    mkdirSync(coverageDir, { recursive: true });
    runCoverageIndexStage(store, projectRoot, coverageDir);
    expect(store.hasCoverageData()).toBe(false);
  });
});

test("a report that maps to no node leaves coverage unknown", () => {
  withProject((projectRoot, coverageDir, store) => {
    writeFileSync(join(projectRoot, "src", "b.ts"), SOURCE);
    writeReport(projectRoot, coverageDir, "src/b.ts");
    runCoverageIndexStage(store, projectRoot, coverageDir);
    expect(store.hasCoverageData()).toBe(false);
  });
});

test("a report that maps to a node marks coverage indexed", () => {
  withProject((projectRoot, coverageDir, store) => {
    writeReport(projectRoot, coverageDir, "src/a.ts");
    runCoverageIndexStage(store, projectRoot, coverageDir);
    expect(store.hasCoverageData()).toBe(true);
  });
});

test("a run whose reports are gone clears an earlier sentinel", () => {
  withProject((projectRoot, coverageDir, store) => {
    writeReport(projectRoot, coverageDir, "src/a.ts");
    runCoverageIndexStage(store, projectRoot, coverageDir);
    rmSync(coverageDir, { recursive: true, force: true });
    runCoverageIndexStage(store, projectRoot, coverageDir);
    expect(store.hasCoverageData()).toBe(false);
  });
});

// Root writes any file, so the readonly DB below would take writes.
test.skipIf(process.getuid?.() === 0).each([false, true])("an unchanged project on a readonly DB indexes with no error (coverage report: %p)", async (withReport) => {
  const projectRoot = mkdtempSync(join(tmpdir(), "pi-cg-covsentinel-ro-"));
  const dbPath = join(projectRoot, "graph.db");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "a.ts"), SOURCE);
  if (withReport) {
    const TEST = 'test("t", () => {});\n';
    writeFileSync(join(projectRoot, "src", "a.test.ts"), TEST);
    const entry = (file: string, text: string) => ({ url: new URL(`file://${join(projectRoot, file)}`).href, functions: [{ functionName: "", ranges: [{ startOffset: 0, endOffset: text.length, count: 1 }] }] });
    mkdirSync(join(projectRoot, ".codegraph", "coverage"), { recursive: true });
    writeFileSync(join(projectRoot, ".codegraph", "coverage", "report.json"), JSON.stringify({ result: [entry("src/a.ts", SOURCE), entry("src/a.test.ts", TEST)] }));
  }
  const client = () => ({ definition: async () => null, references: async () => [], implementations: async () => [], shutdown: async () => {} });
  try {
    const seed = new SqliteGraphStore(dbPath);
    await indexProject(projectRoot, seed, { lspClientFactory: client });
    expect(seed.queryRows("SELECT 1 FROM edges WHERE kind = 'tested_by'")).toHaveLength(withReport ? 1 : 0);
    seed.close();
    chmodSync(dbPath, 0o444);
    const store = new SqliteGraphStore(dbPath);
    try {
      expect((await indexProject(projectRoot, store, { lspClientFactory: client })).errors).toBe(0);
      expect(store.hasCoverageData()).toBe(withReport);
    } finally {
      store.close();
    }
  } finally {
    chmodSync(dbPath, 0o644);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
