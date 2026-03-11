import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { nodeId } from "../src/graph/types.js";

test("getStatistics reports stale files when content hash no longer matches disk", () => {
  const root = join(tmpdir(), `pi-codegraph-stale-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });

  const originalContent = "export function foo() {}";
  writeFileSync(join(root, "src", "a.ts"), originalContent);
  writeFileSync(join(root, "src", "b.ts"), "export function bar() {}");

  const store = new SqliteGraphStore();
  try {
    // Simulate indexing: set file hashes to match current content
    store.setFileHash("src/a.ts", sha256Hex(originalContent));
    store.setFileHash("src/b.ts", sha256Hex("export function bar() {}"));
    store.addNode({
      id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts",
      file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(originalContent),
    });
    store.addNode({
      id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts",
      file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex("export function bar() {}"),
    });

    // Before modification: no stale files
    const statsBefore = store.getStatistics(root);
    expect(statsBefore.files.stale).toBe(0);
    expect(statsBefore.files.total).toBe(2);

    // Modify a.ts on disk
    writeFileSync(join(root, "src", "a.ts"), "export function foo() { return 42; }");

    // After modification: 1 stale file
    const statsAfter = store.getStatistics(root);
    expect(statsAfter.files.stale).toBe(1);
    expect(statsAfter.files.total).toBe(2);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("getStatistics reports 0 stale when no projectRoot provided", () => {
  const store = new SqliteGraphStore();
  try {
    store.setFileHash("src/a.ts", "somehash");
    const stats = store.getStatistics();
    expect(stats.files.stale).toBe(0);
  } finally {
    store.close();
  }
});
