---
id: 1
title: readSourceSnippet utility — happy path
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/output/source.ts
  - test/read-source-snippet.test.ts
---

### Task 1: readSourceSnippet utility — happy path

**Files:**
- Create: `src/output/source.ts`
- Test: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/read-source-snippet.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSourceSnippet } from "../src/output/source.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import type { GraphNode } from "../src/graph/types.js";

test("readSourceSnippet returns hashlined source for a valid node", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-happy-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "line one\nline two\nline three\nline four\nline five\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:2",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 2,
    end_line: 4,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).not.toBeNull();
    // Should contain 3 lines (2, 3, 4)
    const lines = result!.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(3);
    // Each line should be in hashline format: LINE:HASH|content
    for (const line of lines) {
      expect(line).toMatch(/^\d+:[a-f0-9]+\|/);
    }
    // Should contain the actual content
    expect(result).toContain("line two");
    expect(result).toContain("line three");
    expect(result).toContain("line four");
    // Line numbers should be correct
    expect(lines[0]).toMatch(/^2:/);
    expect(lines[1]).toMatch(/^3:/);
    expect(lines[2]).toMatch(/^4:/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/read-source-snippet.test.ts`
Expected: FAIL — `error: Cannot find module "../src/output/source.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/output/source.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";

const DEFAULT_MAX_SOURCE_LINES = 50;

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface SourceSnippetResult {
  /** The hashlined source text */
  text: string;
  /** Whether the file content hash mismatches the node */
  stale: boolean;
  /** Number of lines truncated (0 if not truncated) */
  truncated: number;
}

export function readSourceSnippet(
  node: GraphNode,
  projectRoot: string,
  maxLines?: number,
): SourceSnippetResult | null {
  if (node.end_line == null) return null;

  const fullPath = join(projectRoot, node.file);
  if (!existsSync(fullPath)) return null;

  const fileContent = readFileSync(fullPath, "utf-8");
  const currentHash = sha256Hex(fileContent);
  const stale = currentHash !== node.content_hash;

  const allLines = fileContent.split(/\r?\n/);
  const startIdx = node.start_line - 1;
  const endIdx = node.end_line - 1;

  if (startIdx < 0 || endIdx >= allLines.length || startIdx > endIdx) return null;

  const sourceLines = allLines.slice(startIdx, endIdx + 1);
  const limit = maxLines ?? DEFAULT_MAX_SOURCE_LINES;
  const truncated = sourceLines.length > limit ? sourceLines.length - limit : 0;
  const displayLines = truncated > 0 ? sourceLines.slice(0, limit) : sourceLines;

  const hashlined = displayLines.map((content, i) => {
    const lineNum = node.start_line + i;
    const lineHash = sha256Hex(content.trim()).slice(0, 4);
    return `${lineNum}:${lineHash}|${content}`;
  });

  let text = hashlined.join("\n");
  if (truncated > 0) {
    text += `\n(${truncated} more lines truncated)`;
  }

  return { text, stale, truncated };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 375 tests passing
