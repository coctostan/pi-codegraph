import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { GIT_HEAD_METADATA_KEY, SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";

test("getStatistics counts no git head among the files or the stale ones", async () => {
  // Simulate a store after the git stage has run: its head sits in graph_metadata
  const root = join(tmpdir(), `pi-codegraph-sentinel-stats-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1" });
    const realHash = require("crypto").createHash("sha256").update("export const a = 1;").digest("hex");
    store.setFileHash("src/a.ts", realHash);

    // Simulate the git stage writing its head
    store.setMetadata(GIT_HEAD_METADATA_KEY, "abc123deadbeef");

    // files.total should be 1 (not 2)
    const stats = store.getStatistics(root);
    expect(stats.files.total).toBe(1);
    // files.stale should be 0 (not 1 from the missing sentinel path)
    expect(stats.files.stale).toBe(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
