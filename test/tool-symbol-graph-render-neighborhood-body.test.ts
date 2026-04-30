import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { stripTrustHeader } from "../src/output/read-only-ceremony.js";
import { renderLegacyNeighborhoodBody, symbolGraph } from "../src/tools/symbol-graph.js";

test("renderLegacyNeighborhoodBody is exported and matches the current standalone neighborhood output", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-body-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
  writeFileSync(join(projectRoot, "src/b.ts"), "export function bar() {\n  return 1;\n}\n");

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex("import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
    const hashB = sha256Hex("export function bar() {\n  return 1;\n}\n");

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB, is_exported: true });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const rendered = renderLegacyNeighborhoodBody({ name: "foo", store, projectRoot });
    const standaloneBody = stripTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood"] as any, store, projectRoot }));

    expect(standaloneBody).toBe(rendered.body);
    expect(rendered.body).toContain("### Callees");
    expect(rendered.body).toContain("bar");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
