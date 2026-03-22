import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

test("impact renders 120 annotated dependents under one second", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-perf-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const lines = ["export function shared() { return 1; }"];
  for (let i = 1; i <= 120; i++) {
    lines.push(`export function caller${i}() { return shared(); }`);
  }
  writeFileSync(join(projectRoot, "src", "perf.ts"), `${lines.join("\n")}\n`);

  const store = new SqliteGraphStore();
  try {
    const sharedId = "src/perf.ts::shared:1";
    store.addNode({ id: sharedId, kind: "function", name: "shared", file: "src/perf.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    for (let i = 1; i <= 120; i++) {
      const callerId = `src/perf.ts::caller${i}:${i + 1}`;
      store.addNode({
        id: callerId,
        kind: "function",
        name: `caller${i}`,
        file: "src/perf.ts",
        start_line: i + 1,
        end_line: i + 1,
        content_hash: "h",
        is_exported: false,
      });
      store.addEdge({
        source: callerId,
        target: sharedId,
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.6, evidence: "call", content_hash: "h" },
        created_at: i,
      });
    }

    const startedAt = Date.now();
    const output = impact({
      symbols: ["shared"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 3,
    });
    const elapsedMs = Date.now() - startedAt;

    expect(output).toContain("## Trust");
    const linesOut = output.trim().split("\n");
    const resultLines = linesOut.filter((line) => line.includes("[fan-in:"));
    expect(resultLines).toHaveLength(120);
    expect(elapsedMs).toBeLessThan(1000);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});