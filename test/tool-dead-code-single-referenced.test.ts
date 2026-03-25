import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode single symbol mode reports referenced symbol with reference list", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-ref-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function target() {}\n";
  const fileB = "import { target } from './a';\nexport function caller() { target(); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::target:1", kind: "function", name: "target", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::caller:2", kind: "function", name: "caller", file: "src/b.ts", start_line: 2, end_line: 2, content_hash: hashB, is_exported: true });

    store.addEdge({ source: "src/b.ts::caller:2", target: "src/a.ts::target:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashB }, created_at: Date.now() });
    store.addEdge({ source: "src/b.ts::caller:2", target: "src/a.ts::target:1", kind: "imports", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hashB }, created_at: Date.now() });

    const output = deadCode({ name: "target", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("referenced: yes");
    expect(output).toContain("references: 2");
    expect(output).toContain("caller");
    expect(output).toContain("calls");
    expect(output).toContain("imports");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
