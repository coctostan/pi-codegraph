import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("trace returns a disambiguation list when entry matches multiple symbols", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-ambiguous-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const prodContent = "export function sha256Hex() { return 'prod'; }\n";
  const helperContent = "export function sha256Hex() { return 'helper'; }\n";
  writeFileSync(join(projectRoot, "src", "hash.ts"), prodContent);
  writeFileSync(join(projectRoot, "test", "hash.test.ts"), helperContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/hash.ts::sha256Hex:1",
      kind: "function",
      name: "sha256Hex",
      file: "src/hash.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(prodContent),
    });
    store.addNode({
      id: "test/hash.test.ts::sha256Hex:1",
      kind: "function",
      name: "sha256Hex",
      file: "test/hash.test.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(helperContent),
    });

    const output = trace({ entry: "sha256Hex", store, projectRoot });

    expect(output).toContain('Multiple matches for "sha256Hex"');
    expect(output).toContain("src/hash.ts:1:");
    expect(output).toContain("test/hash.test.ts:1:");
    expect(output).not.toContain('Entry "sha256Hex" not found');
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
