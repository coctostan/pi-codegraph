import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { impact } from "../src/tools/impact.js";

test("impact prepends the shared trust header and marks stale-file scenarios as stale", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-trust-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const sharedContent = "export function shared() { return 1; }\n";
  const callerV1 = "import { shared } from './shared';\nexport function caller() { return shared(); }\n";
  const callerV2 = "import { shared } from './shared';\nexport function caller() { return shared() + 1; }\n";

  writeFileSync(join(projectRoot, "src", "shared.ts"), sharedContent);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerV1);

  const sharedHash = sha256Hex(sharedContent);
  const callerHash = sha256Hex(callerV1);
  const store = new SqliteGraphStore();

  try {
    store.addNode({
      id: "src/shared.ts::shared:1",
      kind: "function",
      name: "shared",
      file: "src/shared.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sharedHash,
      is_exported: true,
    });
    store.addNode({
      id: "src/caller.ts::caller:2",
      kind: "function",
      name: "caller",
      file: "src/caller.ts",
      start_line: 2,
      end_line: 2,
      content_hash: callerHash,
      is_exported: false,
    });
    store.addEdge({
      source: "src/caller.ts::caller:2",
      target: "src/shared.ts::shared:1",
      kind: "calls",
      provenance: {
        source: "tree-sitter",
        confidence: 0.8,
        evidence: "shared:2:35",
        content_hash: callerHash,
      },
      created_at: 1,
    });
    store.setFileHash("src/shared.ts", sharedHash);
    store.setFileHash("src/caller.ts", callerHash);

    const freshOutput = impact({
      symbols: ["shared"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 3,
    });
    const freshLines = freshOutput.trimEnd().split("\n");

    expect(freshLines[0]).toBe("Trust: fresh");
    expect(freshOutput).not.toContain("depth:1 [stale]");

    writeFileSync(join(projectRoot, "src", "caller.ts"), callerV2);

    const staleOutput = impact({
      symbols: ["shared"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 3,
    });
    const staleLines = staleOutput.trimEnd().split("\n");

    expect(staleLines[0]).toBe("Trust: partial");
    expect(staleOutput).toContain("changed files: src/caller.ts");
    expect(staleOutput).toContain("stale edges: 1");
    expect(staleOutput).toContain("impact may be incomplete; refresh index before relying on this result");
    expect(staleOutput).toContain("depth:1 [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
