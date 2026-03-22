import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery prepends the shared trust header and keeps stale node markers local", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-trust-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const content = "export function hello() { return 'world'; }\n";
  writeFileSync(join(projectRoot, "src", "hello.ts"), content);

  const freshHash = sha256Hex(content);
  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/hello.ts::hello:1",
      kind: "function",
      name: "hello",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: freshHash,
      is_exported: true,
    });

    const freshOutput = graphQuery({
      query: 'MATCH (a {name: "hello"}) RETURN a',
      store,
      projectRoot,
    });
    const freshLines = freshOutput.trimEnd().split("\n");

    expect(freshLines[0]).toBe("## Trust");
    expect(freshLines[1]).toBe("status: fresh");
    expect(freshLines[2]).toBe("evidence: none  stale-files: 0/0");
    expect(freshLines[3]).toBe("rows: 1");
    expect(freshOutput).not.toContain("[stale]");

    store.addNode({
      id: "src/hello.ts::hello:1",
      kind: "function",
      name: "hello",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "stale-hash",
      is_exported: true,
    });

    const mixedOutput = graphQuery({
      query: 'MATCH (a {name: "hello"}) RETURN a',
      store,
      projectRoot,
    });
    const mixedLines = mixedOutput.trimEnd().split("\n");

    expect(mixedLines[0]).toBe("## Trust");
    expect(mixedLines[1]).toBe("status: mixed");
    expect(mixedLines[2]).toBe("evidence: none  stale-files: 0/0");
    expect(mixedOutput).toContain("a: src/hello.ts:1:");
    expect(mixedOutput).toContain("function [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
