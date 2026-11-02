import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraphResult } from "../src/tools/symbol-graph.js";

// top -> mid -> bottom, none exported, no coverage indexed: top and mid carry no tag at all.
test("a node with no role and unknown coverage renders no tag, no empty Signals section, no trailing space", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "pi-cg-untagged-"));
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "function top() { return mid(); }\nfunction mid() { return bottom(); }\nfunction bottom() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), content);
  const hash = sha256Hex(content);
  const store = new SqliteGraphStore();
  try {
    for (const [line, name] of ["top", "mid", "bottom"].entries()) {
      store.addNode({ id: `src/app.ts::${name}:${line + 1}`, kind: "function", name, file: "src/app.ts", start_line: line + 1, end_line: line + 1, content_hash: hash });
    }
    for (const [source, target] of [["top:1", "mid:2"], ["mid:2", "bottom:3"]]) {
      store.addEdge({
        source: `src/app.ts::${source}`,
        target: `src/app.ts::${target}`,
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5, evidence: target, content_hash: hash },
        created_at: 1,
      });
    }
    store.setFileHash("src/app.ts", hash);

    const card = symbolGraphResult({ name: "mid", store, projectRoot }).text;
    expect(card).not.toContain("### Signals");

    const neighborhood = symbolGraphResult({ name: "mid", store, projectRoot, include: ["neighborhood"] }).text;
    expect(neighborhood).toContain("top  calls");
    for (const text of [card, neighborhood]) {
      expect(text.startsWith("Trust: fresh\n- coverage: unknown, no coverage report indexed\n")).toBe(true);
      expect(text.split("\n").filter((line) => line.endsWith(" "))).toEqual([]);
    }
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
