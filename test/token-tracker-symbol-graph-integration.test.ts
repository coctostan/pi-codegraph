import { expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { resetSession, appendTokenMeta } from "../src/tools/token-tracker.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

beforeEach(() => { resetSession(); });

test("appendTokenMeta appends _meta line with token stats to tool output", () => {
  const projectRoot = join(tmpdir(), `pi-cg-meta-sg-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    const text = symbolGraph({ name: "foo", store, projectRoot });
    const output = appendTokenMeta("symbol_graph", { name: "foo" }, text, store, projectRoot);
    expect(output).toContain("_meta:");
    expect(output).toContain("tokens_saved:");
    expect(output).toContain("naive_tokens:");
    expect(output).toContain("actual_tokens:");
    expect(output).toContain("session_calls:1");
    expect(output).toContain("session_tokens_saved:");
    const lines = output.trim().split("\n");
    expect(lines[lines.length - 1]).toMatch(/^_meta:/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
