import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview includes hub symbols sorted by degree", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-hubs-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function hub() {}\n";
  const fileB = "export function leaf1() {}\n";
  const fileC = "export function leaf2() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);
  writeFileSync(join(projectRoot, "src/c.ts"), fileC);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    const hashC = sha256Hex(fileC);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.setFileHash("src/c.ts", hashC);

    store.addNode({ id: "src/a.ts::hub:1", kind: "function", name: "hub", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::leaf1:1", kind: "function", name: "leaf1", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });
    store.addNode({ id: "src/c.ts::leaf2:1", kind: "function", name: "leaf2", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: hashC, is_exported: true });

    store.addEdge({ source: "src/a.ts::hub:1", target: "src/b.ts::leaf1:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashA }, created_at: Date.now() });
    store.addEdge({ source: "src/a.ts::hub:1", target: "src/c.ts::leaf2:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashA }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Hub Symbols");
    expect(output).toContain("hub");
    expect(output).toContain("function");
    expect(output).toContain("src/a.ts");
    const hubIdx = output.indexOf("hub");
    const leaf1Idx = output.indexOf("leaf1");
    expect(hubIdx).toBeLessThan(leaf1Idx);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
