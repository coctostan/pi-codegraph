import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery executes a node-only query and renders anchored results", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-node-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function hello() { return 'world'; }\n";
  writeFileSync(join(projectRoot, "src/hello.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/hello.ts::hello:1",
      kind: "function",
      name: "hello",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(content),
    });

    const output = graphQuery({
      query: 'MATCH (a {name: "hello"}) RETURN a',
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("a: src/hello.ts:1:");
    expect(output).toContain("hello");
    expect(output).toContain("function");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
