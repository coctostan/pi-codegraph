import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract omits Takes and Returns when node has no signature", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-nosig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const srcContent = `export function doStuff() {
  if (!ready) return;
  throw new Error("not implemented");
}
`;
  writeFileSync(join(projectRoot, "src/stuff.ts"), srcContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(srcContent);

    store.addNode({
      id: "src/stuff.ts::doStuff:1", kind: "function", name: "doStuff",
      file: "src/stuff.ts", start_line: 1, end_line: 4,
      content_hash: hash, is_exported: true,
    });

    const output = symbolContract({ name: "doStuff", store, projectRoot });

    expect(output).not.toContain("### Takes");
    expect(output).not.toContain("### Returns");
    expect(output).toContain("### Throws / Error paths");
    expect(output).toContain("not implemented");
    expect(output).toContain("### Guards / Preconditions");
    expect(output).toContain("!ready");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
