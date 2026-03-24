import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard filters out __meta__ and __unresolved__ neighbors from relationships", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-meta-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() { bar(); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(fileContent);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hash });
    // Internal meta node
    store.addNode({ id: "__meta__/resolver::resolver::callers::src/a.ts::foo:1", kind: "function", name: "resolver_marker", file: "__meta__/resolver", start_line: 1, end_line: 1, content_hash: "fake" });
    // Unresolved import target
    store.addNode({ id: "__unresolved__::bar:0", kind: "function", name: "bar", file: "__unresolved__", start_line: 0, end_line: 0, content_hash: "fake" });

    store.addEdge({
      source: "src/a.ts::foo:1", target: "__unresolved__::bar:0", kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.3, evidence: "call", content_hash: hash },
      created_at: Date.now(),
    });
    store.addEdge({
      source: "__meta__/resolver::resolver::callers::src/a.ts::foo:1", target: "src/a.ts::foo:1", kind: "calls",
      provenance: { source: "lsp", confidence: 0.8, evidence: "meta", content_hash: "fake" },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    // Should NOT contain internal markers in output
    expect(output).not.toContain("__meta__");
    expect(output).not.toContain("__unresolved__");
    expect(output).not.toContain("resolver_marker");
    // Should NOT have Key Relationships since the only neighbors are internal
    expect(output).not.toContain("### Key Relationships");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
