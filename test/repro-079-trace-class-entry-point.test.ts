import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

test("trace does not stop at a class entry point that has methods", () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-079-${Date.now()}`);
  const file = "src/store.ts";
  const content = [
    "export class SqliteGraphStore {",
    "  constructor() {}",
    "  getNode() { return 1; }",
    "  findNodes() { return 2; }",
    "}",
  ].join("\n") + "\n";

  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, file), content);

  const extracted = extractFile(file, content);
  const store = new SqliteGraphStore();
  try {
    store.addNode(extracted.module);
    for (const node of extracted.nodes) store.addNode(node);
    for (const edge of extracted.edges) store.addEdge(edge);

    const output = trace({ entry: "SqliteGraphStore", file, store, projectRoot });
    expect(output).not.toMatch(/SqliteGraphStore\s+class .*leaf/);
    expect(output).toMatch(/constructor|class entry:/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
