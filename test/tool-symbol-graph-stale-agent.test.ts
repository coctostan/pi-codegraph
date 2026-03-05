import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolGraph marks stale agent edges with [stale]", () => {
  const projectRoot = join(tmpdir(), `pi-cg-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() {}\n";
  const fileBContent = "export function bar() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);

  const hashA = sha256Hex(fileAContent);
  const hashB = sha256Hex(fileBContent);

  try {
    const store = new SqliteGraphStore();

    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: hashA,
    });
    store.addNode({
      id: "src/b.ts::bar:1",
      kind: "function",
      name: "bar",
      file: "src/b.ts",
      start_line: 1,
      end_line: 1,
      content_hash: hashB,
    });

    // Set file hash in the store
    store.setFileHash("src/a.ts", hashA);

    // Agent edge with matching content_hash (fresh)
    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "agent",
        confidence: 0.7,
        evidence: "foo calls bar",
        content_hash: hashA,  // matches current file hash
      },
      created_at: Date.now(),
    });

    // Query foo — the agent edge to bar should NOT be stale
    const freshOutput = symbolGraph({ name: "foo", store, projectRoot });
    expect(freshOutput).toContain("bar");
    expect(freshOutput).toContain("Callees");
    // The callee line for bar should not have [stale]
    const freshLines = freshOutput.split("\n").filter(l => l.includes("bar") && l.includes("calls"));
    expect(freshLines.length).toBeGreaterThan(0);
    expect(freshLines[0]).not.toContain("[stale]");

    // Now update the file hash to simulate source file changed
    store.setFileHash("src/a.ts", "new_different_hash");

    // Query foo again — the agent edge should now be marked [stale]
    const staleOutput = symbolGraph({ name: "foo", store, projectRoot });
    expect(staleOutput).toContain("bar");
    // The callee line for bar should have [stale] since agent edge content_hash != current file hash
    const staleLines = staleOutput.split("\n").filter(l => l.includes("bar") && l.includes("calls"));
    expect(staleLines.length).toBeGreaterThan(0);
    expect(staleLines[0]).toContain("[stale]");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
