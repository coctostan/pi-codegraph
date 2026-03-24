import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";

test("symbolCard returns not-found message with trust header for unknown symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nf-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function foo() {}\n");

  try {
    const store = new SqliteGraphStore();
    const output = symbolCard({ name: "doesNotExist", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("not found");
    expect(output).toContain("doesNotExist");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
