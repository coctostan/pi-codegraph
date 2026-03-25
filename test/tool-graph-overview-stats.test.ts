import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview includes node kind distribution and file stats", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-stats-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  const fileB = "export class Bar {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::Bar:1", kind: "class", name: "Bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    const output = graphOverview({ store, projectRoot });

    // Trust header
    expect(output).toContain("## Trust");

    // Symbols section with counts
    expect(output).toContain("## Symbols");
    expect(output).toContain("function: 1");
    expect(output).toContain("class: 1");

    // Files section
    expect(output).toContain("## Files");
    expect(output).toContain("total: 2");
    expect(output).toContain("stale: 0");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("graphOverview returns empty graph message when no nodes exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-empty-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const output = graphOverview({ store, projectRoot });
    expect(output).toContain("## Trust");
    expect(output).toContain("empty");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
