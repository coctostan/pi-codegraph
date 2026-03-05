---
id: 2
title: Create extractFile() result shape with module node + content hash
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/indexer-extract-file.test.ts
---

### Task 2: Create `extractFile()` result shape with module node + content hash [depends: 1]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Create: `test/indexer-extract-file.test.ts`

**Step 1 — Write the failing test**
Create `test/indexer-extract-file.test.ts`:
```ts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile returns module node with stable id and SHA-256 content hash", () => {
  const file = "src/a.ts";
  const content = "function foo() {}";

  const result = extractFile(file, content);

  const expectedHash = createHash("sha256").update(content).digest("hex");

  expect(result.module).toEqual({
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(result.nodes).toEqual([]);
  expect(result.edges).toEqual([]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: FAIL — `SyntaxError: The requested module '../src/indexer/tree-sitter.js' does not provide an export named 'extractFile'`

**Step 3 — Write minimal implementation**
Replace `src/indexer/tree-sitter.ts` with:
```ts
import { createHash } from "node:crypto";

import type { GraphEdge, GraphNode } from "../graph/types.js";
import { nodeId } from "../graph/types.js";

export interface ExtractionResult {
  module: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function countLines(content: string): number {
  // "" is 1 line
  return content.split(/\r?\n/).length;
}

export function extractFile(file: string, content: string): ExtractionResult {
  const contentHash = sha256Hex(content);

  const moduleNode: GraphNode = {
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: countLines(content),
    content_hash: contentHash,
  };

  return { module: moduleNode, nodes: [], edges: [] };
}

// Back-compat with the existing placeholder export test
export const treeSitterIndex = extractFile;
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-extract-file.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
