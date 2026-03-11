import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery accepts a single-quoted equality predicate in WHERE", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-single-quote-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const graphStoreContent = "export interface GraphStore {}\n";
  writeFileSync(join(projectRoot, "src", "graph-store.ts"), graphStoreContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/graph-store.ts::GraphStore:1",
      kind: "interface",
      name: "GraphStore",
      file: "src/graph-store.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(graphStoreContent),
    });

    const output = graphQuery({
      query: "MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name",
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("n.name: GraphStore");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
