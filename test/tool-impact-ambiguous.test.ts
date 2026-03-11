import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("impact returns a disambiguation list instead of aggregating all ambiguous symbol matches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-ambiguous-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const prodContent = "export function sha256Hex() { return 'prod'; }\n";
  const helperContent = "export function sha256Hex() { return 'helper'; }\n";
  const callerContent = "export function caller() { return sha256Hex(); }\n";
  writeFileSync(join(projectRoot, "src", "hash.ts"), prodContent);
  writeFileSync(join(projectRoot, "test", "hash.test.ts"), helperContent);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerContent);

  const store = new SqliteGraphStore();
  try {
    const prodNode = {
      id: "src/hash.ts::sha256Hex:1",
      kind: "function" as const,
      name: "sha256Hex",
      file: "src/hash.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(prodContent),
    };
    const testNode = {
      id: "test/hash.test.ts::sha256Hex:1",
      kind: "function" as const,
      name: "sha256Hex",
      file: "test/hash.test.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(helperContent),
    };
    const callerNode = {
      id: "src/caller.ts::caller:1",
      kind: "function" as const,
      name: "caller",
      file: "src/caller.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(callerContent),
    };

    store.addNode(prodNode);
    store.addNode(testNode);
    store.addNode(callerNode);
    store.addEdge({
      source: callerNode.id,
      target: prodNode.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "sha256Hex", content_hash: sha256Hex(callerContent) },
      created_at: 1,
    });

    const output = impact({
      symbols: ["sha256Hex"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 3,
    });

    expect(output).toContain('Multiple matches for "sha256Hex"');
    expect(output).toContain("src/hash.ts:1:");
    expect(output).toContain("test/hash.test.ts:1:");
    expect(output).not.toContain("caller  breaking  depth:1");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
