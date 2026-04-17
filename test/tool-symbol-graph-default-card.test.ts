import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph defaults to a compact card and include:[] matches omitted include", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-card-${Date.now()}`);
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
    const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
    const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });

    expect(withoutInclude).toBe(withEmptyInclude);
    expect(withoutInclude).toContain("## foo (function)");
    expect(withoutInclude).toContain("### Signature");
    expect(withoutInclude).toContain("### Covering Tests");
    expect(withoutInclude).toContain("### Key Relationships");
    expect(withoutInclude).toContain("### Signals");
    expect(withoutInclude).not.toContain("### Exported");
    expect(withoutInclude).not.toContain("### Contract");
    expect(withoutInclude).not.toContain("### Source");
    expect(withoutInclude.toLowerCase()).not.toContain("deprecated");
    expect(withoutInclude).not.toContain("use symbol_graph instead");
    expect(withoutInclude).not.toContain("symbol_card(");
    expect(withoutInclude).not.toContain("symbol_contract(");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolGraph keeps not-found and ambiguous handling explicit in the default card base", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-card-empty-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function foo() {}\n");
  writeFileSync(join(projectRoot, "src/b.ts"), "export class foo {}\n");
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex("export function foo() {}\n");
    const hashB = sha256Hex("export class foo {}\n");
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB });

    expect(symbolGraph({ name: "doesNotExist", store, projectRoot })).toContain('Symbol "doesNotExist" not found');
    const ambiguous = symbolGraph({ name: "foo", store, projectRoot });
    expect(ambiguous).toContain('Multiple matches for "foo"');
    expect(ambiguous).toContain("src/a.ts");
    expect(ambiguous).toContain("src/b.ts");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
