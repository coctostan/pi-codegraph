import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runCoverageIndexStage } from "../src/indexer/coverage.js";

test("runCoverageIndexStage marks coverage indexed even when coverage dir is missing", () => {
  const projectRoot = join(tmpdir(), `pi-cg-covmark-missing-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });
  const store = new SqliteGraphStore();
  try {
    expect(store.hasCoverageData()).toBe(false);
    runCoverageIndexStage(store, projectRoot, join(projectRoot, ".codegraph", "coverage"));
    expect(store.hasCoverageData()).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("runCoverageIndexStage marks coverage indexed when coverage dir exists with no reports", () => {
  const projectRoot = join(tmpdir(), `pi-cg-covmark-empty-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(coverageDir, { recursive: true });
  const store = new SqliteGraphStore();
  try {
    runCoverageIndexStage(store, projectRoot, coverageDir);
    expect(store.hasCoverageData()).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("runCoverageIndexStage marks coverage indexed when reports exist but match no nodes", () => {
  const projectRoot = join(tmpdir(), `pi-cg-covmark-norec-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(coverageDir, { recursive: true });
  // coverage report references a file that has no nodes in the store
  writeFileSync(join(coverageDir, "report.json"), JSON.stringify({ result: [] }));
  const store = new SqliteGraphStore();
  try {
    runCoverageIndexStage(store, projectRoot, coverageDir);
    expect(store.hasCoverageData()).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
