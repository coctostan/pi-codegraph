import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const noopClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

test("indexProject result shape remains backward-compatible for summary counts", async () => {
  const root = join(tmpdir(), `pi-codegraph-index-shape-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");

  const store = new SqliteGraphStore();
  try {
    const result = await indexProject(root, store, { lspClientFactory: () => noopClient });

    expect(result).toMatchObject({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
    expect(result.timings).toBeDefined();
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
