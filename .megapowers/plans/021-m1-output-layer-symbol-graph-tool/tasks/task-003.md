---
id: 3
title: computeAnchor returns file:line:hash for a fresh node
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/output/anchoring.ts
files_to_create:
  - test/output-compute-anchor.test.ts
---

**Spec criteria:** 5, 6, 9

**Files:**
- Modify: `src/output/anchoring.ts`
- Create: `test/output-compute-anchor.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/output-compute-anchor.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeAnchor } from "../src/output/anchoring.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("computeAnchor returns file:line:hash format with stale=false for fresh file", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "line one\nexport function foo() {}\nline three";
  const filePath = "src/a.ts";
  writeFileSync(join(projectRoot, filePath), fileContent);

  const contentHash = sha256Hex(fileContent);
  // line 2 content is "export function foo() {}"
  const lineContent = "export function foo() {}";
  const lineHash = sha256Hex(lineContent.trim()).slice(0, 4);

  const node = {
    id: "src/a.ts::foo:2",
    kind: "function" as const,
    name: "foo",
    file: filePath,
    start_line: 2,
    end_line: 2,
    content_hash: contentHash,
  };

  const result = computeAnchor(node, projectRoot);

  expect(result.anchor).toBe(`src/a.ts:2:${lineHash}`);
  expect(result.stale).toBe(false);

  rmSync(projectRoot, { recursive: true, force: true });
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: FAIL — TypeError: computeAnchor is not a function (or import error since the export doesn't exist)

**Step 3 — Write minimal implementation**

Replace `src/output/anchoring.ts`:

```typescript
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";

export interface AnchorResult {
  anchor: string;
  stale: boolean;
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function computeAnchor(node: GraphNode, projectRoot: string): AnchorResult {
  const fullPath = join(projectRoot, node.file);

  if (!existsSync(fullPath)) {
    return {
      anchor: `${node.file}:${node.start_line}:?`,
      stale: true,
    };
  }

  const fileContent = readFileSync(fullPath, "utf-8");
  const currentHash = sha256Hex(fileContent);
  const stale = currentHash !== node.content_hash;

  const lines = fileContent.split(/\r?\n/);
  const lineIndex = node.start_line - 1;

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return {
      anchor: `${node.file}:${node.start_line}:?`,
      stale: true,
    };
  }

  const lineContent = lines[lineIndex]!.trim();
  const lineHash = sha256Hex(lineContent).slice(0, 4);

  return {
    anchor: `${node.file}:${node.start_line}:${lineHash}`,
    stale,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
