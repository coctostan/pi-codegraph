import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview suggests queries only for edge kinds present in the graph", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-queries-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  const fileB = "export function bar() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    // Only 'calls' edges
    store.addEdge({ source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashA }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Suggested Queries");
    expect(output).toContain("calls");
    expect(output).not.toContain("routes_to");
    expect(output).not.toContain("tested_by");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("graphOverview suggests route queries when routes_to edges exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-routes-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function handler() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);

    store.addNode({ id: "src/a.ts::handler:1", kind: "function", name: "handler", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "__meta__::GET /api:1", kind: "endpoint", name: "GET /api", file: "__meta__", start_line: 1, end_line: 1, content_hash: "x" });

    store.addEdge({ source: "src/a.ts::handler:1", target: "__meta__::GET /api:1", kind: "routes_to", provenance: { source: "ast-grep", confidence: 0.8, evidence: "route", content_hash: hashA }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Suggested Queries");
    expect(output).toContain("routes_to");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
