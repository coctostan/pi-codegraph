import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { traceResult } from "../src/tools/trace.js";

test("trace reports stale static call-edge freshness warning", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-static-edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const app = "export function entry() { return leaf(); }\nexport function leaf() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), app);
  const appHash = sha256Hex(app);
  const store = new SqliteGraphStore();

  try {
    store.addNode({ id: "src/app.ts::entry:1", kind: "function", name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: appHash, is_exported: true });
    store.addNode({ id: "src/app.ts::leaf:2", kind: "function", name: "leaf", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: appHash, is_exported: true });
    store.addEdge({
      source: "src/app.ts::entry:1",
      target: "src/app.ts::leaf:2",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "entry calls leaf", content_hash: "old-edge-hash" },
      created_at: 1,
    });
    store.setFileHash("src/app.ts", appHash);

    const output = traceResult({ entry: "entry", store, projectRoot }).text;
    expect(output).toContain("Trust: partial");
    expect(output).toContain("stale edges: 1");
    expect(output).toContain("trace path may be unreliable; refresh index before relying on this result");
    expect(output).toContain("mode: static (heuristic, no runtime evidence) [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("trace counts a printed unresolved call's stale edge in its freshness", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-static-edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const app = "export function entry() { return hole(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), app);
  const appHash = sha256Hex(app);
  const store = new SqliteGraphStore();

  try {
    store.addNode({ id: "src/app.ts::entry:1", kind: "function", name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: appHash, is_exported: true });
    store.addEdge({
      source: "src/app.ts::entry:1",
      target: "__unresolved__::hole:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "hole:1:34", content_hash: "old-edge-hash" },
      created_at: 1,
    });
    store.setFileHash("src/app.ts", appHash);

    const output = traceResult({ entry: "entry", store, projectRoot }).text;
    expect(output).toContain("? hole (unresolved, src/app.ts:1)");
    expect(output).toContain("Trust: partial");
    expect(output).toContain("stale edges: 1");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
