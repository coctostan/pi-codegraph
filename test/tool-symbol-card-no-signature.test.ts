import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard shows 'not available' when node has no signature", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nosig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(fileContent);

    // Node WITHOUT signature field
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hash });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Signature");
    expect(output).toContain("not available");
    // Should NOT contain "undefined" or "null" as strings
    expect(output).not.toContain("undefined");
    expect(output).not.toContain("null");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
