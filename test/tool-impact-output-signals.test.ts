import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

test("impact appends always-on why annotations with chain confidence", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-signals-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "caller.ts"), "import { shared } from './shared';\nexport function caller() { return shared(); }\n");

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    store.addNode({ id: "src/caller.ts::caller:2", kind: "function", name: "caller", file: "src/caller.ts", start_line: 2, end_line: 2, content_hash: "h", is_exported: false });
    store.addEdge({
      source: "src/caller.ts::caller:2",
      target: "src/shared.ts::shared:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "shared:2:35", content_hash: "h" },
      created_at: 1,
    });

    const out = impact({ symbols: ["shared"], changeType: "signature_change", store, projectRoot, maxDepth: 3 });
    expect(out).toContain("## Trust");
    expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0\.00, chain-confidence:0\.80\]/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
