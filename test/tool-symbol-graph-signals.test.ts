import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph renders inline role tags on header and resolved neighbors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-signals-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const sharedContent = "export function shared() { return helper(); }\n";
  const helperContent = "export function helper() { return 1; }\n";
  const testContent = "it('shared', () => expect(1).toBe(1));\n";

  writeFileSync(join(projectRoot, "src", "shared.ts"), sharedContent);
  writeFileSync(join(projectRoot, "src", "helper.ts"), helperContent);
  writeFileSync(join(projectRoot, "test", "shared.test.ts"), testContent);

  const store = new SqliteGraphStore();
  try {
    store.markCoverageIndexed();
    const sharedId = "src/shared.ts::shared:1";
    const helperId = "src/helper.ts::helper:1";
    const testId = "test/shared.test.ts::shared test:1";

    store.addNode({ id: sharedId, kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(sharedContent), is_exported: true });
    store.addNode({ id: helperId, kind: "function", name: "helper", file: "src/helper.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(helperContent), is_exported: false });
    store.addNode({ id: testId, kind: "test", name: "shared test", file: "test/shared.test.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(testContent), is_exported: false });

    store.addEdge({
      source: sharedId,
      target: helperId,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.9, evidence: "call", content_hash: "h" },
      created_at: 1,
    });

    store.addEdge({
      source: sharedId,
      target: testId,
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "v8", content_hash: "h" },
      created_at: 1,
    });

    const out = symbolGraph({ name: "shared", include: ["neighborhood"] as any, store, projectRoot });

    expect(out).toMatch(/src\/shared\.ts:1:[0-9a-f]{4} \[entry-point, tested\]/);
    expect(out).toMatch(/src\/helper\.ts:1:[0-9a-f]{4}  helper  calls  confidence:0\.9  tree-sitter \[leaf, untested\]/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
