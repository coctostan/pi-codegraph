---
id: 3
title: Switch computeAnchor to bare editable anchors
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - src/output/anchoring.ts
  - test/output-compute-anchor.test.ts
  - test/extension-impact.test.ts
files_to_create: []
---

Covers AC 5, AC 6, AC 7, AC 8, AC 16.

**Files:**
- Modify: `src/output/anchoring.ts`
- Modify: `test/output-compute-anchor.test.ts`
- Modify: `test/extension-impact.test.ts`

**Step 1 — Write the failing test**
Replace `test/output-compute-anchor.test.ts` with:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeAnchor, computeLineHash } from "../src/output/anchoring.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("computeAnchor emits bare editable anchors with separate file context", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "line one\nexport function foo() {}\nline three";
  const filePath = "src/a.ts";
  writeFileSync(join(projectRoot, filePath), fileContent);

  const node = {
    id: "src/a.ts::foo:2",
    kind: "function" as const,
    name: "foo",
    file: filePath,
    start_line: 2,
    end_line: 2,
    content_hash: sha256Hex(fileContent),
  };

  try {
    const result = computeAnchor(node, projectRoot);

    expect(result.file).toBe("src/a.ts");
    expect(result.anchor).toBe("2:c27");
    expect(result.anchor).toMatch(/^\d+:[0-9a-f]{3}$/);
    expect(result.anchor).not.toContain("src/a.ts");
    expect(result.stale).toBe(false);

    const match = result.anchor.match(/^(\d+):([0-9a-f]{3})$/);
    expect(match).not.toBeNull();
    const lineNumber = Number(match![1]);
    const emittedHash = match![2];
    const line = fileContent.split("\n")[lineNumber - 1]!;
    expect(emittedHash).toBe(computeLineHash(lineNumber, line));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("computeAnchor preserves stale status while emitting current bare anchor", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const originalContent = "line one\nexport function foo() {}\nline three";
  const modifiedContent = "line one\nexport function foo() { return 1; }\nline three";
  const filePath = "src/a.ts";
  writeFileSync(join(projectRoot, filePath), modifiedContent);

  const node = {
    id: "src/a.ts::foo:2",
    kind: "function" as const,
    name: "foo",
    file: filePath,
    start_line: 2,
    end_line: 2,
    content_hash: sha256Hex(originalContent),
  };

  try {
    const result = computeAnchor(node, projectRoot);

    expect(result.file).toBe("src/a.ts");
    expect(result.anchor).toBe(`2:${computeLineHash(2, "export function foo() { return 1; }")}`);
    expect(result.stale).toBe(true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("computeAnchor returns stale non-editable anchors for unavailable line content", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-unavailable-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "line one\nline two\n");

  const node = {
    id: "src/a.ts::foo:1",
    kind: "function" as const,
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: sha256Hex("line one\nline two\n"),
  };

  try {
    expect(computeAnchor({ ...node, file: "src/gone.ts", start_line: 5 }, projectRoot)).toEqual({
      file: "src/gone.ts",
      anchor: "5:?",
      stale: true,
    });
    expect(computeAnchor({ ...node, start_line: 99 }, projectRoot)).toEqual({
      file: "src/a.ts",
      anchor: "99:?",
      stale: true,
    });
    expect(computeAnchor({ ...node, file: "src" }, projectRoot)).toEqual({
      file: "src",
      anchor: "1:?",
      stale: true,
    });
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Also update the existing direct `computeAnchor(...)` regression in `test/extension-impact.test.ts` so the full suite stays green immediately after this task:

```ts
const result = computeAnchor(node, projectRoot);
expect(result.file).toBe("src/f.ts");
expect(result.anchor).toMatch(/^1:[0-9a-f]{3}$/);
expect(result.anchor).not.toContain("src/f.ts");
expect(typeof result.stale).toBe("boolean");
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` because `computeAnchor(...)` still emits the old `src/a.ts:2:<4hex>` file-prefixed token instead of the bare `2:c27` `LINE:HASH` token and does not return `result.file`.

**Step 3 — Write minimal implementation**
In `src/output/anchoring.ts`, update `AnchorResult` and `computeAnchor` to use the Task 1 `computeLineHash(lineNumber: number, line: string): string` helper while keeping `sha256Hex(...)` for whole-file stale detection:

```ts
export interface AnchorResult {
  file: string;
  anchor: string;
  stale: boolean;
}

export function computeAnchor(node: GraphNode, projectRoot: string): AnchorResult {
  const fullPath = join(projectRoot, node.file);

  if (!existsSync(fullPath)) {
    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
  }

  let fileContent: string;
  try {
    fileContent = readFileSync(fullPath, "utf-8");
  } catch {
    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
  }

  const currentHash = sha256Hex(fileContent);
  const stale = currentHash !== node.content_hash;
  const lines = fileContent.split("\n");
  const lineIndex = node.start_line - 1;

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
  }

  const lineHash = computeLineHash(node.start_line, lines[lineIndex]!);
  return { file: node.file, anchor: `${node.start_line}:${lineHash}`, stale };
}
```

In `test/extension-impact.test.ts`, replace the old direct-anchor assertion:

```ts
expect(result.anchor).toMatch(/^src\/f\.ts:1:[0-9a-f]{4}$/);
```

with the `file` plus bare-anchor assertions from Step 1. This is required for Task 3's full-suite gate because this test imports `computeAnchor(...)` directly.

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing after updating affected direct `AnchorResult` fixtures in this task.
