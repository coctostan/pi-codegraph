import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract returns disambiguation list when multiple nodes match", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() {}\n";
  const fileBContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);

  try {
    const store = new SqliteGraphStore();
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    store.addNode({
      id: "src/a.ts::foo:1", kind: "function", name: "foo",
      file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA,
    });
    store.addNode({
      id: "src/b.ts::foo:1", kind: "class", name: "foo",
      file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB,
    });

    const output = symbolContract({ name: "foo", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
    expect(output).toContain("function");
    expect(output).toContain("class");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
