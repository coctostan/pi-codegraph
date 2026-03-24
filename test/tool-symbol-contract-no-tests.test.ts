import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract omits test-evidenced behaviors section when no tested_by edges exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-notests-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const srcContent = `export function greet(name: string): string {
  if (!name) throw new Error("name required");
  return "hello " + name;
}
`;
  writeFileSync(join(projectRoot, "src/greet.ts"), srcContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(srcContent);

    store.addNode({
      id: "src/greet.ts::greet:1", kind: "function", name: "greet",
      file: "src/greet.ts", start_line: 1, end_line: 4,
      content_hash: hash, is_exported: true,
      signature: "(name: string) => string",
    });

    const output = symbolContract({ name: "greet", store, projectRoot });

    expect(output).toContain("### Takes");
    expect(output).toContain("### Returns");
    expect(output).toContain("### Throws / Error paths");
    expect(output).toContain("name required");
    expect(output).not.toContain("Test-evidenced behaviors");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
