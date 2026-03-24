import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract correctly parses signature with nested generic type params", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-gen-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const srcContent = `export function merge<T extends Map<string, number>>(a: T, b: T): T {
  return a;
}
`;
  writeFileSync(join(projectRoot, "src/merge.ts"), srcContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(srcContent);

    store.addNode({
      id: "src/merge.ts::merge:1", kind: "function", name: "merge",
      file: "src/merge.ts", start_line: 1, end_line: 3,
      content_hash: hash, is_exported: true,
      signature: "<T extends Map<string, number>>(a: T, b: T) => T",
    });

    const output = symbolContract({ name: "merge", store, projectRoot });

    // Should correctly parse params despite nested generics in type params
    expect(output).toContain("### Takes");
    expect(output).toContain("a: T");
    expect(output).toContain("b: T");
    expect(output).toContain("### Returns");
    expect(output).toContain("T");
    // Should NOT contain the raw type param bracket artifacts
    expect(output).not.toContain(">(");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
