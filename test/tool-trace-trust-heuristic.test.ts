import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

test("trace prepends the shared trust header for static heuristic paths without changing mode semantics", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-trust-heuristic-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const content = "export function entry() { return first(); }\nexport function first() { return second(); }\nexport function second() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), content);

  const fileHash = sha256Hex(content);
  const store = new SqliteGraphStore();

  try {
    const entry = { id: "src/app.ts::entry:1", kind: "function" as const, name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: fileHash, is_exported: true };
    const first = { id: "src/app.ts::first:2", kind: "function" as const, name: "first", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: fileHash, is_exported: false };
    const second = { id: "src/app.ts::second:3", kind: "function" as const, name: "second", file: "src/app.ts", start_line: 3, end_line: 3, content_hash: fileHash, is_exported: false };

    store.addNode(entry);
    store.addNode(first);
    store.addNode(second);
    store.addEdge({
      source: entry.id,
      target: first.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "first", content_hash: fileHash },
      created_at: 1,
    });
    store.addEdge({
      source: first.id,
      target: second.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "second", content_hash: fileHash },
      created_at: 2,
    });
    store.setFileHash("src/app.ts", fileHash);

    const output = trace({ entry: "entry", file: "src/app.ts", store, projectRoot });
    const lines = output.trimEnd().split("\n");

    expect(lines[0]).toBe("Trust: fresh");
    expect(lines[1]).toBe("mode: static (heuristic, no runtime evidence)");
    expect(lines[2]).toMatch(/src\/app\.ts  1:[0-9a-f]{3}/);
    expect(lines[2]).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
    expect(lines[2]).toContain("entry  function");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
