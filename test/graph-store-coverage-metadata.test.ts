import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore.hasCoverageData starts false and toggles true after markCoverageIndexed", () => {
  const store = new SqliteGraphStore();
  try {
    expect(store.hasCoverageData()).toBe(false);
    store.markCoverageIndexed();
    expect(store.hasCoverageData()).toBe(true);
    // idempotent
    store.markCoverageIndexed();
    expect(store.hasCoverageData()).toBe(true);
  } finally {
    store.close();
  }
});

test("SqliteGraphStore.hasCoverageData persists across close + reopen", () => {
  const dir = join(tmpdir(), `pi-cg-cov-meta-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "graph.db");
  try {
    const a = new SqliteGraphStore(dbPath);
    expect(a.hasCoverageData()).toBe(false);
    a.markCoverageIndexed();
    a.close();

    const b = new SqliteGraphStore(dbPath);
    try {
      expect(b.hasCoverageData()).toBe(true);
    } finally {
      b.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
