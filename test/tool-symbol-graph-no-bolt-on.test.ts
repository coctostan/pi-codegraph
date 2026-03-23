import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph natively renders implements edges without bolt-on suffix", () => {
  const projectRoot = join(tmpdir(), `pi-cg-nobolt-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  writeFileSync(
    join(projectRoot, "src/iface.ts"),
    "export interface MyInterface {\n  run(): void;\n}\n",
  );
  writeFileSync(
    join(projectRoot, "src/impl.ts"),
    "export class MyImpl implements MyInterface {\n  run() {}\n}\n",
  );

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const hashIface = sha256Hex(require("node:fs").readFileSync(join(projectRoot, "src/iface.ts"), "utf-8"));
    const hashImpl = sha256Hex(require("node:fs").readFileSync(join(projectRoot, "src/impl.ts"), "utf-8"));

    store.addNode({ id: "src/iface.ts::MyInterface:1", kind: "interface", name: "MyInterface", file: "src/iface.ts", start_line: 1, end_line: 3, content_hash: hashIface });
    store.addNode({ id: "src/impl.ts::MyImpl:1", kind: "class", name: "MyImpl", file: "src/impl.ts", start_line: 1, end_line: 2, content_hash: hashImpl });

    store.addEdge({
      source: "src/impl.ts::MyImpl:1",
      target: "src/iface.ts::MyInterface:1",
      kind: "implements",
      provenance: { source: "lsp", confidence: 0.9, evidence: "implements clause", content_hash: hashImpl },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "MyInterface", store, projectRoot });

    // Implemented By should appear natively (from symbol-graph.ts, not bolt-on)
    expect(output).toContain("### Implemented By");
    expect(output).toContain("MyImpl");

    // Should NOT have a separate "### Implementations" section (old bolt-on format)
    expect(output).not.toContain("### Implementations");

    // Count occurrences of "Implemented By" — should appear exactly once (no duplicates)
    const matches = output.match(/### Implemented By/g);
    expect(matches?.length).toBe(1);

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("renderImplementationsSuffix is no longer exported from index.ts", async () => {
  const mod = await import("../src/index.js");
  expect((mod as any).renderImplementationsSuffix).toBeUndefined();
});