import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard renders full card with signature, relationships, and signals", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-happy-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
  const fileBContent = "export function bar() {\n  return 1;\n}\n";
  const testContent = "test('foo works', () => {});\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  writeFileSync(join(projectRoot, "test/foo.test.ts"), testContent);

  try {
    const store = new SqliteGraphStore();
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);
    const hashTest = sha256Hex(testContent);

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true, signature: "(bar: Bar) => void" });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });
    store.addNode({ id: "test/foo.test.ts::foo works:1", kind: "test", name: "foo works", file: "test/foo.test.ts", start_line: 1, end_line: 1, content_hash: hashTest });

    // foo calls bar
    store.addEdge({
      source: "src/a.ts::foo:3", target: "src/b.ts::bar:1", kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });
    // foo imports bar
    store.addEdge({
      source: "src/a.ts::foo:3", target: "src/b.ts::bar:1", kind: "imports",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hashA },
      created_at: Date.now(),
    });
    // foo tested_by test
    store.addEdge({
      source: "src/a.ts::foo:3", target: "test/foo.test.ts::foo works:1", kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    // Header
    expect(output).toContain("## Trust");
    expect(output).toContain("## foo (function)");
    expect(output).toMatch(/src\/a\.ts  3:[0-9a-f]{3}/);
    expect(output).not.toMatch(/src\/a\.ts:3:[0-9a-f]{4}/);

    // Signature
    expect(output).toContain("### Signature");
    expect(output).toContain("(bar: Bar) => void");

    // Exported
    expect(output).toContain("### Exported");
    expect(output).toContain("yes");

    // Covering Tests
    expect(output).toContain("### Covering Tests");
    expect(output).toContain("foo works");

    // Key Relationships
    expect(output).toContain("### Key Relationships");
    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    expect(output).toContain("Imports");

    // Signals
    expect(output).toContain("### Signals");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
