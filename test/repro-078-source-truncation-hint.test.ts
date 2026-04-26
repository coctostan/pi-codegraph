// Reproduction for issue #078 — symbol_graph source include: truncated
// output gives no token count or continuation path.
//
// Acceptance: when readSourceSnippet truncates the body, the trailing
// notice must include a read() hint pointing at the first omitted line
// (file path + offset + limit) so the agent can fetch the rest in one
// follow-up call.

import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSourceSnippet } from "../src/output/source.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import type { GraphNode } from "../src/graph/types.js";

test("repro-078: truncated source includes read() continuation hint", () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-078-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  // 100-line function body. With the default maxLines of 50, we expect
  // 50 lines truncated and a hint pointing at line 51.
  const lines = Array.from({ length: 100 }, (_, i) => `  // line ${i + 1}`);
  const fileContent = lines.join("\n") + "\n";
  writeFileSync(join(projectRoot, "src/big.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/big.ts::big:1",
    kind: "function",
    name: "big",
    file: "src/big.ts",
    start_line: 1,
    end_line: 100,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot, 50);
    expect(result).not.toBeNull();
    expect(result!.truncated).toBe(50);

    // Bug: today the truncation notice is the bare string
    //   "(50 more lines truncated)"
    // and the agent has no way to read the remaining 50 lines without
    // a separate symbol lookup. The fix should emit a single-line hint
    // referencing the file path, the offset of the first omitted line,
    // and the count to read.

    // The hint must reference the file path so the agent can call read directly.
    expect(result!.text).toContain("src/big.ts");

    // The hint must reference the first omitted line as an offset.
    // First displayed line is 1, last displayed is 50, so first omitted is 51.
    expect(result!.text).toMatch(/offset:\s*51\b/);

    // The hint must indicate how many more lines remain.
    expect(result!.text).toMatch(/limit:\s*50\b/);

    // And it should be expressed as a read() call so the agent can copy/paste it.
    expect(result!.text).toMatch(/read\(/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
