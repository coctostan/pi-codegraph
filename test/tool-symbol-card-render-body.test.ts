import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { renderSymbolCardBody } from "../src/tools/symbol-card.js";

test("renderSymbolCardBody returns the compact card base view without Source or Exported", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-body-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
  const fileBContent = "export function bar() {\n  return 1;\n}\n";
  const testContent = "test('foo works', () => {});\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  writeFileSync(join(projectRoot, "test/foo.test.ts"), testContent);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);
    const hashTest = sha256Hex(testContent);
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true, signature: "() => void" });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB, is_exported: true, signature: "() => number" });
    store.addNode({ id: "test/foo.test.ts::foo works:1", kind: "test", name: "foo works", file: "test/foo.test.ts", start_line: 1, end_line: 1, content_hash: hashTest });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "test/foo.test.ts::foo works:1",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: hashA },
      created_at: Date.now(),
    });

    const rendered = renderSymbolCardBody({ name: "foo", store, projectRoot });
    expect(rendered.body).toContain("## foo (function)");
    expect(rendered.body).toContain("### Signature");
    expect(rendered.body).toContain("### Covering Tests");
    expect(rendered.body).toContain("### Key Relationships");
    expect(rendered.body).toContain("### Signals");
    expect(rendered.body).not.toContain("### Source");
    expect(rendered.body).not.toContain("### Exported");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
