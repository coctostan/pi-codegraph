import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph prepends the shared trust header and keeps stale row markers local", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-trust-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fooContent = "export function foo() { return bar(); }\n";
  const barContent = "export function bar() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "a.ts"), fooContent);
  writeFileSync(join(projectRoot, "src", "b.ts"), barContent);

  const fooHash = sha256Hex(fooContent);
  const barHash = sha256Hex(barContent);
  const store = new SqliteGraphStore();

  try {
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: fooHash,
      is_exported: true,
    });
    store.addNode({
      id: "src/b.ts::bar:1",
      kind: "function",
      name: "bar",
      file: "src/b.ts",
      start_line: 1,
      end_line: 1,
      content_hash: barHash,
      is_exported: false,
    });
    store.setFileHash("src/a.ts", fooHash);

    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "agent",
        confidence: 0.7,
        evidence: "foo calls bar",
        content_hash: fooHash,
      },
      created_at: 1,
    });

    const freshOutput = symbolGraph({ name: "foo", file: "src/a.ts", include: ["neighborhood"] as any, store, projectRoot });
    const freshLines = freshOutput.trimEnd().split("\n");

    expect(freshLines[0]).toBe("## Trust");
    expect(freshLines[1]).toBe("status: fresh");
    expect(freshLines[2]).toBe("evidence: agent  stale-files: 0/1");
    expect(freshOutput).toContain("## foo (function)");
    expect(freshOutput).not.toContain("bar  calls  confidence:0.7  agent [stale]");

    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "agent",
        confidence: 0.7,
        evidence: "foo calls bar",
        content_hash: "old-hash",
      },
      created_at: 2,
    });

    const mixedOutput = symbolGraph({ name: "foo", file: "src/a.ts", include: ["neighborhood"] as any, store, projectRoot });
    const mixedLines = mixedOutput.trimEnd().split("\n");

    expect(mixedLines[0]).toBe("## Trust");
    expect(mixedLines[1]).toBe("status: mixed");
    expect(mixedLines[2]).toBe("evidence: agent  stale-files: 0/1");
    expect(mixedOutput).toContain("bar  calls  confidence:0.7  agent [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
