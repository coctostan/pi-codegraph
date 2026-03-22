import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

test("trace prepends a runtime-backed trust header and degrades to mixed when a stored coverage step goes stale", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-trust-runtime-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const appV1 = "export function prod() { return helper(); }\nexport function helper() { return 1; }\n";
  const appV2 = "export function prod() { return helper() + 1; }\nexport function helper() { return 1; }\n";
  const testContent = "export function prodTest() { return prod(); }\n";

  writeFileSync(join(projectRoot, "src", "app.ts"), appV1);
  writeFileSync(join(projectRoot, "test", "app.test.ts"), testContent);

  const appHash = sha256Hex(appV1);
  const testHash = sha256Hex(testContent);
  const store = new SqliteGraphStore();

  try {
    const testNode = { id: "test/app.test.ts::prodTest:1", kind: "test" as const, name: "prodTest", file: "test/app.test.ts", start_line: 1, end_line: 1, content_hash: testHash, is_exported: false };
    const prod = { id: "src/app.ts::prod:1", kind: "function" as const, name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: appHash, is_exported: true };
    const helper = { id: "src/app.ts::helper:2", kind: "function" as const, name: "helper", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: appHash, is_exported: false };

    store.addNode(testNode);
    store.addNode(prod);
    store.addNode(helper);
    store.addEdge({
      source: prod.id,
      target: helper.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "helper", content_hash: appHash },
      created_at: 1,
    });
    store.addEdge({
      source: prod.id,
      target: testNode.id,
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 1, evidence: "v8", content_hash: appHash },
      created_at: 2,
    });
    store.saveTestTrace({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: testHash },
        { nodeId: prod.id, ordinal: 1, contentHash: appHash },
        { nodeId: helper.id, ordinal: 2, contentHash: appHash },
      ],
    });
    store.setFileHash("src/app.ts", appHash);
    store.setFileHash("test/app.test.ts", testHash);

    const freshOutput = trace({ entry: "prod", file: "src/app.ts", store, projectRoot });
    const freshLines = freshOutput.trimEnd().split("\n");

    expect(freshLines[0]).toBe("## Trust");
    expect(freshLines[1]).toBe("status: runtime-backed");
    expect(freshLines[2]).toBe("evidence: coverage,tree-sitter  stale-files: 0/2");
    expect(freshLines[3]).toBe("mode: coverage");
    expect(freshOutput).not.toContain("function [stale]");

    writeFileSync(join(projectRoot, "src", "app.ts"), appV2);

    const mixedOutput = trace({ entry: "prod", file: "src/app.ts", store, projectRoot });
    const mixedLines = mixedOutput.trimEnd().split("\n");

    expect(mixedLines[0]).toBe("## Trust");
    expect(mixedLines[1]).toBe("status: mixed");
    expect(mixedLines[2]).toBe("evidence: coverage,tree-sitter  stale-files: 1/2");
    expect(mixedLines[3]).toBe("mode: coverage [stale]");
    expect(mixedOutput).toContain("prod  function [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
