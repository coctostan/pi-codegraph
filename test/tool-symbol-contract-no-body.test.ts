import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";

test("symbolContract omits throws/guards when source file does not exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-nobody-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  try {
    const store = new SqliteGraphStore();

    store.addNode({
      id: "src/missing.ts::doStuff:1", kind: "function", name: "doStuff",
      file: "src/missing.ts", start_line: 1, end_line: 5,
      content_hash: "abc123", is_exported: true,
      signature: "(x: number) => string",
    });

    const output = symbolContract({ name: "doStuff", store, projectRoot });

    expect(output).toContain("### Takes");
    expect(output).toContain("x: number");
    expect(output).toContain("### Returns");
    expect(output).toContain("string");
    expect(output).not.toContain("### Throws");
    expect(output).not.toContain("### Guards");
    expect(output).toContain("## Trust");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
