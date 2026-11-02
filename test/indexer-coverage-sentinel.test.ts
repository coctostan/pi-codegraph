import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runCoverageIndexStage } from "../src/indexer/coverage.js";

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
