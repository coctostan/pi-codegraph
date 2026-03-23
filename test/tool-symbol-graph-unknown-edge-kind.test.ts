import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph renders unknown edge kind with generic title instead of dropping it", () => {
  const projectRoot = join(tmpdir(), `pi-cg-unknown-edge-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  writeFileSync(
    join(projectRoot, "src/a.ts"),
    "export function alpha() {}\n",
  );
  writeFileSync(
    join(projectRoot, "src/b.ts"),
    "export function beta() {}\n",
  );

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const hashA = sha256Hex(require("node:fs").readFileSync(join(projectRoot, "src/a.ts"), "utf-8"));
    const hashB = sha256Hex(require("node:fs").readFileSync(join(projectRoot, "src/b.ts"), "utf-8"));

    store.addNode({ id: "src/a.ts::alpha:1", kind: "function", name: "alpha", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA });
    store.addNode({ id: "src/b.ts::beta:1", kind: "function", name: "beta", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB });

    // Use a hypothetical future edge kind by casting
    store.addEdge({
      source: "src/a.ts::alpha:1",
      target: "src/b.ts::beta:1",
      kind: "delegates_to" as any,
      provenance: { source: "agent", confidence: 0.8, evidence: "agent-written", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "alpha", store, projectRoot });

    // Should NOT silently drop the edge
    expect(output).toContain("beta");
    // Should render a generic title derived from the kind
    expect(output).toContain("Delegates To");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
