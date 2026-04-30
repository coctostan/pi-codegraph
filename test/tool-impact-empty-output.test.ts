import { expect, test } from "bun:test";
// Regression tests for #042 and #043: impact empty output diagnostics
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

function setupProjectWithGraph() {
  const projectRoot = join(tmpdir(), `pi-cg-impact-empty-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "caller.ts"), "import { shared } from './shared';\nexport function caller() { return shared(); }\n");
  const store = new SqliteGraphStore();
  store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: "h" });
  store.addNode({ id: "src/caller.ts::caller:2", kind: "function", name: "caller", file: "src/caller.ts", start_line: 2, end_line: 2, content_hash: "h" });
  store.addEdge({
    source: "src/caller.ts::caller:2",
    target: "src/shared.ts::shared:1",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.8, evidence: "shared:2:35", content_hash: "h" },
    created_at: 1,
  });
  return { projectRoot, store };
}

test("impact() returns diagnostic message for non-existent symbol (#042)", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: ["nonExistentSymbol_ZZZ"],
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    // Should contain the trust header
    expect(out).toContain("Trust: fresh");
    // Must contain a diagnostic about the symbol not being found
    expect(out).toContain("not found");
    expect(out).toContain("nonExistentSymbol_ZZZ");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() returns diagnostic message for addition change type (#043)", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: ["shared"],
      changeType: "addition",
      store,
      projectRoot,
      maxDepth: 5,
    });
    // Should contain the trust header
    expect(out).toContain("Trust: stale");
    // Must contain a message explaining that addition analysis isn't supported
    // or at least some non-empty body beyond the trust header
    const bodyAfterTrust = out.split("\n").filter(line => !line.startsWith("Trust:") && !line.startsWith("- ") && line.trim() !== "");
    const hasNonHeaderContent = bodyAfterTrust.length > 0;
    expect(hasNonHeaderContent).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});