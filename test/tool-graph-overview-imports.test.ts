import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview includes most-imported files sorted by import count", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-imports-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileShared = "export function shared() {}\n";
  const fileCaller1 = "import { shared } from './shared';\nexport function c1() { shared(); }\n";
  const fileCaller2 = "import { shared } from './shared';\nexport function c2() { shared(); }\n";
  writeFileSync(join(projectRoot, "src/shared.ts"), fileShared);
  writeFileSync(join(projectRoot, "src/c1.ts"), fileCaller1);
  writeFileSync(join(projectRoot, "src/c2.ts"), fileCaller2);

  const store = new SqliteGraphStore();
  try {
    const hashS = sha256Hex(fileShared);
    const hash1 = sha256Hex(fileCaller1);
    const hash2 = sha256Hex(fileCaller2);
    store.setFileHash("src/shared.ts", hashS);
    store.setFileHash("src/c1.ts", hash1);
    store.setFileHash("src/c2.ts", hash2);

    store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: hashS, is_exported: true });
    store.addNode({ id: "src/c1.ts::c1:2", kind: "function", name: "c1", file: "src/c1.ts", start_line: 2, end_line: 2, content_hash: hash1, is_exported: true });
    store.addNode({ id: "src/c2.ts::c2:2", kind: "function", name: "c2", file: "src/c2.ts", start_line: 2, end_line: 2, content_hash: hash2, is_exported: true });

    store.addEdge({ source: "src/c1.ts::c1:2", target: "src/shared.ts::shared:1", kind: "imports", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hash1 }, created_at: Date.now() });
    store.addEdge({ source: "src/c2.ts::c2:2", target: "src/shared.ts::shared:1", kind: "imports", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hash2 }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Most-Imported Files");
    expect(output).toContain("src/shared.ts");
    expect(output).toMatch(/src\/shared\.ts.*2/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
