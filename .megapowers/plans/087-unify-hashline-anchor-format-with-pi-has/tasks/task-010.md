---
id: 10
title: Render source snippets with compatible line hashes
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - src/output/source.ts
  - test/read-source-snippet.test.ts
files_to_create: []
---

Covers AC 13 and AC 14.

**Files:**
- Modify: `src/output/source.ts`
- Modify: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**
Update `test/read-source-snippet.test.ts` to expect exact 3-character compatible line hashes, and add invalid-range guards:

```ts
import { computeLineHash, ensureHashInit } from "../src/output/anchoring.js";
```

In valid-file tests, call `await ensureHashInit();` before `readSourceSnippet(...)` and make the tests async. In the happy-path test, replace the generic hash assertion with:

```ts
const result = readSourceSnippet(node, projectRoot);
expect(result).not.toBeNull();
const lines = result!.text.split("\n").filter((l) => l.length > 0);
expect(lines).toEqual([
  `2:${computeLineHash(2, "line two")}|line two`,
  `3:${computeLineHash(3, "line three")}|line three`,
  `4:${computeLineHash(4, "line four")}|line four`,
]);
for (const line of lines) {
  expect(line).toMatch(/^\d+:[a-f0-9]{3}\|/);
}
```

Add this test:

```ts
test("readSourceSnippet returns null for invalid requested line ranges", async () => {
  await ensureHashInit();
  const projectRoot = join(tmpdir(), `pi-cg-src-invalid-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "line one\nline two\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 2,
    content_hash: hash,
  };

  try {
    expect(readSourceSnippet({ ...node, start_line: 0, end_line: 1 }, projectRoot)).toBeNull();
    expect(readSourceSnippet({ ...node, start_line: 2, end_line: 99 }, projectRoot)).toBeNull();
    expect(readSourceSnippet({ ...node, start_line: 3, end_line: 2 }, projectRoot)).toBeNull();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/read-source-snippet.test.ts`
Expected: FAIL — `expect(received).toMatch(expected)` because source snippets still render 4-character SHA-derived line hashes instead of 3-character compatible hashes.

**Step 3 — Write minimal implementation**
In `src/output/source.ts`, import the shared helper:

```ts
import { computeLineHash } from "./anchoring.js";
```

Keep `sha256Hex` for whole-file stale detection, but update hashlined source rendering:

```ts
const allLines = fileContent.split("\n");
const startIdx = node.start_line - 1;
const endIdx = node.end_line - 1;

if (startIdx < 0 || endIdx >= allLines.length || startIdx > endIdx) return null;

const sourceLines = allLines.slice(startIdx, endIdx + 1);
const limit = maxLines ?? DEFAULT_MAX_SOURCE_LINES;
const truncated = sourceLines.length > limit ? sourceLines.length - limit : 0;
const displayLines = truncated > 0 ? sourceLines.slice(0, limit) : sourceLines;

const hashlined = displayLines.map((content, i) => {
  const lineNum = node.start_line + i;
  const lineHash = computeLineHash(lineNum, content);
  return `${lineNum}:${lineHash}|${content}`;
});
```

Do not change guard behavior: keep returning `null` when `end_line` is missing, the file is missing, or the requested range is invalid.

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
