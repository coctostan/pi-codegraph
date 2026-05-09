# Plan

### Task 1: Add pi-hashline-compatible line hash helper

Covers AC 1, AC 2, AC 3, AC 4, AC 17.

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src/output/anchoring.ts`
- Create: `test/output-hashline-compat.test.ts`

**Step 1 — Write the failing test**
Create `test/output-hashline-compat.test.ts`:

```ts
import { expect, test } from "bun:test";
import { computeLineHash, ensureHashInit } from "../src/output/anchoring.js";

test("computeLineHash matches pi-hashline-readmap golden vectors", async () => {
  await ensureHashInit();

  expect(computeLineHash(1, "export function foo() {}" )).toBe("c27");
  expect(computeLineHash(1, "export   function foo() {}")).toBe("c27");
  expect(computeLineHash(1, "  return 1;")).toBe("0da");
  expect(computeLineHash(1, "  return 1;\r")).toBe("0da");
  expect(computeLineHash(1, "")).toBe("d05");
  expect(computeLineHash(1, "   \t  ")).toBe("d05");
});

test("computeLineHash fails clearly before hash initialization", async () => {
  const mod = await import(`../src/output/anchoring.js?uninit-${Date.now()}`);
  expect(() => mod.computeLineHash(1, "export function foo() {}"))
    .toThrow("Hash not initialized — call ensureHashInit() first");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-hashline-compat.test.ts`
Expected: FAIL — `SyntaxError: Export named 'computeLineHash' not found in module '../src/output/anchoring.js'.`

**Step 3 — Write minimal implementation**
Add dependency in `package.json` under `dependencies`:

```json
"xxhash-wasm": "^1.1.0"
```

Run `bun install` to update `bun.lock`.

In `src/output/anchoring.ts`, add the xxhash helper code near the top of the file while keeping existing `sha256Hex` for file-level stale detection:

```ts
import xxhashWasm from "xxhash-wasm";

const HASH_LEN = 3;
const RADIX = 16;
const HASH_MOD = RADIX ** HASH_LEN;
const HASH_DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));

let h32Fn: ((input: string, seed?: number) => number) | null = null;
let initPromise: Promise<void> | null = null;

export async function ensureHashInit(): Promise<void> {
  if (h32Fn) return;
  if (!initPromise) {
    initPromise = xxhashWasm().then((hasher) => {
      h32Fn = hasher.h32;
    });
  }
  await initPromise;
}

function xxh32(input: string): number {
  if (!h32Fn) throw new Error("Hash not initialized — call ensureHashInit() first");
  return h32Fn(input, 0) >>> 0;
}

export function computeLineHash(_lineNumber: number, line: string): string {
  if (line.endsWith("\r")) line = line.slice(0, -1);
  line = line.replace(/\s+/g, "");
  return HASH_DICT[xxh32(line) % HASH_MOD]!;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-hashline-compat.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.

### Task 2: Initialize direct test hash runtime [depends: 1]

Covers AC 3 and AC 4 for direct unit tests that call synchronous hashline-compatible helpers and renderers.

**Files:**
- Create: `bunfig.toml`
- Create: `test/setup-hash-init.ts`
- Create: `test/hash-init-preload.test.ts`

**Step 1 — Write the failing test**
Create `test/hash-init-preload.test.ts`:

```ts
import { expect, test } from "bun:test";
import { computeLineHash } from "../src/output/anchoring.js";

test("direct unit tests preload hash initialization before synchronous line hashing", () => {
  expect(computeLineHash(1, "export function foo() {}")).toBe("c27");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/hash-init-preload.test.ts`
Expected: FAIL — `Error: Hash not initialized — call ensureHashInit() first`

**Step 3 — Write minimal implementation**
Create `test/setup-hash-init.ts`:

```ts
import { ensureHashInit } from "../src/output/anchoring.js";

await ensureHashInit();
```

Create `bunfig.toml`:

```toml
[test]
preload = ["./test/setup-hash-init.ts"]
```

This initializes hashing once for direct Bun unit tests that call `computeLineHash`, `computeAnchor`, `symbolGraph`, `impact`, `trace`, `symbolCard`, `renderLegacyNeighborhoodBody`, or `readSourceSnippet` without repeating `await ensureHashInit()` in every test file. The Task 1 pre-init guard test still uses a cache-busted module import and continues to verify the clear pre-init failure path.

**Step 4 — Run test, verify it passes**
Run: `bun test test/hash-init-preload.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.

### Task 3: Switch computeAnchor to bare editable anchors [depends: 1, 2]

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

### Task 4: Initialize hash helper in extension tools [depends: 1, 2, 3]

Covers AC 3 and AC 4 for public extension tool execution.

**Files:**
- Modify: `src/index.ts`
- Create: `test/extension-hash-init.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-hash-init.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("extension tool execution initializes hashing before rendering anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-extension-hash-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const runnerRoot = join(tmpdir(), `pi-cg-extension-runner-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(runnerRoot, { recursive: true });
  writeFileSync(join(projectRoot, "src", "foo.ts"), "export function foo() {}\n");

  const emptyBunfig = join(runnerRoot, "bunfig.toml");
  const runner = join(runnerRoot, "runner.ts");
  writeFileSync(emptyBunfig, "[test]\n");
  writeFileSync(
    runner,
    `
import piCodegraph, { resetStoreForTesting } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "src/index.ts")).href)};
import { expect } from "bun:test";

const tools: any[] = [];
const mockPi = {
  registerTool(tool: any) {
    tools.push(tool);
  },
};

resetStoreForTesting();
piCodegraph(mockPi as any);
const tool = tools.find((candidate) => candidate.name === "symbol_graph");
if (!tool) throw new Error("symbol_graph was not registered");

try {
  const result = await tool.execute(
    "hash-init",
    { name: "foo", file: "src/foo.ts", suppressTrustHeader: true },
    undefined,
    () => {},
    { cwd: ${JSON.stringify(projectRoot)} },
  );
  const text = result.content[0].text as string;
  expect(text).toContain("## foo (function)");
  expect(text).toMatch(/\b1:c27\b/);
  expect(text).not.toContain("Hash not initialized");
} finally {
  resetStoreForTesting();
}
`,
  );

  try {
    const result = spawnSync("bun", ["--config", emptyBunfig, runner], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    expect(result.stderr).not.toContain("Hash not initialized");
    expect(result.status).toBe(0);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(runnerRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-hash-init.test.ts`
Expected: FAIL — the child extension runtime exits with `Error: Hash not initialized — call ensureHashInit() first` in stderr because the extension executor reaches `computeAnchor(...)` without first calling `ensureHashInit()`.

**Step 3 — Write minimal implementation**
In `src/index.ts`, import `ensureHashInit`:

```ts
import { ensureHashInit } from "./output/anchoring.js";
```

Then initialize hashing in each public read-only tool executor after indexing and before calling renderers that may synchronously call `computeLineHash(...)` through `computeAnchor(...)`.

For `symbol_graph`:

```ts
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      await ensureHashInit();
      let resolvedNode: any | null = null;
```

For `impact`:

```ts
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      await ensureHashInit();
      const text = impact({
```

For `trace`:

```ts
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      await ensureHashInit();
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-hash-init.test.ts`
Expected: PASS — the extension result text satisfies:

```ts
expect(text).toContain("## foo (function)");
expect(text).toMatch(/\b1:c27\b/);
expect(text).not.toContain("Hash not initialized");
```

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.

### Task 5: Render neighborhood anchors with separate file context [depends: 2, 3]

Covers AC 9 and part of AC 15.

**Files:**
- Modify: `src/output/anchoring.ts`
- Modify: `test/output-format-neighborhood.test.ts`
- Modify: `test/tool-symbol-graph.test.ts`
- Modify: `test/tool-symbol-graph-signals.test.ts`

**Step 1 — Write the failing test**
Update `test/output-format-neighborhood.test.ts` so AnchorResult fixtures include `file` and the output assertions require separate file context:

```ts
import { expect, test } from "bun:test";
import { formatAnchorLocation, formatNeighborhood } from "../src/output/anchoring.js";
import type { AnchorResult } from "../src/output/anchoring.js";

test("formatAnchorLocation renders file path separately from bare editable anchor", () => {
  const anchor: AnchorResult = { file: "src/a.ts", anchor: "10:abc", stale: false };

  expect(formatAnchorLocation(anchor)).toBe("src/a.ts  10:abc");
  expect(formatAnchorLocation(anchor)).not.toContain("src/a.ts:10:");
});

test("formatNeighborhood renders header and neighbor rows with file-separated anchors", () => {
  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: { file: "src/a.ts", anchor: "10:abc", stale: false } },
    [
      {
        title: "Callers",
        section: {
          items: [
            {
              anchor: { file: "src/b.ts", anchor: "5:123", stale: false },
              name: "caller1",
              edgeKind: "calls",
              confidence: 0.9,
              provenanceSource: "tree-sitter",
            },
          ],
          omitted: 0,
        },
      },
    ],
  );

  expect(output).toContain("## myFunc (function)");

Update existing symbol graph neighborhood assertions in `test/tool-symbol-graph.test.ts` and `test/tool-symbol-graph-signals.test.ts` in the same task. Replace old assertions such as:

```ts
expect(output).toContain("src/a.ts:3:");
expect(out).toMatch(/src\/shared\.ts:1:[0-9a-f]{4} \[entry-point, tested\]/);
```

with file-separated 3-hex assertions:

```ts
expect(output).toMatch(/src\/a\.ts  3:[0-9a-f]{3}/);
expect(out).toMatch(/src\/shared\.ts  1:[0-9a-f]{3} \[entry-point, tested\]/);
expect(output).not.toMatch(/src\/a\.ts:3:[0-9a-f]{4}/);
```
  expect(output).toContain("src/a.ts  10:abc");
  expect(output).toContain("src/b.ts  5:123  caller1  calls");
  expect(output).not.toContain("src/a.ts:10:");
  expect(output).not.toContain("src/b.ts:5:");
});
```

Keep the existing omission, stale-marker, unresolved, and ordering tests, but update their `AnchorResult` fixtures to include `file` and 3-character bare anchors.

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: FAIL — `SyntaxError: Export named 'formatAnchorLocation' not found in module '../src/output/anchoring.js'.`

**Step 3 — Write minimal implementation**
In `src/output/anchoring.ts`, add:

```ts
export function formatAnchorLocation(anchor: AnchorResult): string {
  return `${anchor.file}  ${anchor.anchor}`;
}
```

Update `formatSection` and `formatNeighborhood` to use it:

```ts
function formatSection(title: string, section: NeighborSection): string {
  if (section.items.length === 0 && section.omitted === 0) return "";

  const lines: string[] = [];
  lines.push(`\n### ${title}`);

  for (const item of section.items) {
    const staleMarker = item.anchor.stale ? " [stale]" : "";
    const signalTags = item.signals ? ` ${formatRoleTags(item.signals)}` : "";
    lines.push(
      `  ${formatAnchorLocation(item.anchor)}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}${signalTags}`,
    );
  }

  if (section.omitted > 0) lines.push(`  (${section.omitted} more omitted)`);
  return lines.join("\n");
}

export function formatNeighborhood(symbol: SymbolHeader, sections: NamedSection[]): string {
  const staleMarker = symbol.anchor.stale ? " [stale]" : "";
  const signalTags = symbol.signals ? ` ${formatRoleTags(symbol.signals)}` : "";
  const header = `## ${symbol.name} (${symbol.kind})\n${formatAnchorLocation(symbol.anchor)}${staleMarker}${signalTags}`;
  const renderedSections = sections
    .map((s) => formatSection(s.title, s.section))
    .filter((s) => s.length > 0)
    .join("\n");
  return `${header}${renderedSections}\n`;
}
```

Also replace all existing old-shape neighborhood assertions in `test/tool-symbol-graph.test.ts` and `test/tool-symbol-graph-signals.test.ts` so `bun test` passes at this task's Step 5.

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.

### Task 6: Render symbol-resolution candidates with separate file context [depends: 2, 3, 5]

Covers AC 10 and part of AC 15.

**Files:**
- Modify: `src/tools/symbol-resolution.ts`
- Modify: `src/tools/symbol-graph.ts`
- Modify: `test/tool-impact-ambiguous.test.ts`
- Modify: `test/tool-trace-ambiguous.test.ts`
- Create: `test/tool-symbol-resolution-anchor-format.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-symbol-resolution-anchor-format.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { formatAmbiguousMatches } from "../src/tools/symbol-resolution.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("formatAmbiguousMatches renders candidate files separately from editable anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-res-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const aContent = "export function foo() {}\n";
  const bContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  try {
    const output = formatAmbiguousMatches("foo", [
      { id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(aContent) },
      { id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(bContent) },
    ], projectRoot);

    expect(output).toContain('Multiple matches for "foo"');
    expect(output).toContain("src/a.ts  1:c27  foo (function)");
    expect(output).toMatch(/src\/b\.ts  1:[0-9a-f]{3}  foo \(class\)/);
    expect(output).not.toContain("src/a.ts:1:");
    expect(output).not.toContain("src/b.ts:1:");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolGraph neighborhood ambiguity uses file-separated candidate anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const aContent = "export function foo() {}\n";
  const bContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(aContent) });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(bContent) });

    const output = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });

    expect(output).toContain('Multiple matches for "foo"');
    expect(output).toContain("src/a.ts  1:c27  foo (function)");
    expect(output).toMatch(/src\/b\.ts  1:[0-9a-f]{3}  foo \(class\)/);
    expect(output).not.toContain("src/a.ts:1:");
    expect(output).not.toContain("src/b.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update existing public ambiguity tests in the same task. In `test/tool-impact-ambiguous.test.ts` and `test/tool-trace-ambiguous.test.ts`, replace old assertions such as:

```ts
expect(output).toContain("src/hash.ts:1:");
expect(output).toContain("test/hash.test.ts:1:");
```

with:

```ts
expect(output).toMatch(/src\/hash\.ts  1:[0-9a-f]{3}/);
expect(output).toMatch(/test\/hash\.test\.ts  1:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/hash\.ts:1:[0-9a-f]{4}/);
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-resolution-anchor-format.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` with `Expected substring: "src/a.ts  1:c27  foo (function)"` because candidate rows still render the old `anchor  name  file` order.

**Step 3 — Write minimal implementation**
In `src/tools/symbol-resolution.ts`, update imports and rendering:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";

export function formatAmbiguousMatches(name: string, nodes: GraphNode[], projectRoot: string): string {
  const lines: string[] = [`Multiple matches for "${name}":`, ""];
  for (const node of nodes) {
    const anchor = computeAnchor(node, projectRoot);
    const staleMarker = anchor.stale ? " [stale]" : "";
    lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
  }
  return `${lines.join("\n")}\n`;
}
```

In `src/tools/symbol-graph.ts`, add `formatAnchorLocation` to the anchoring import:

```ts
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  formatAnchorLocation,
  type AnchoredNeighbor,
  type NeighborSection,
  type NamedSection,
} from "../output/anchoring.js";
```

Then update the `renderLegacyNeighborhoodBody(...)` ambiguity row:

```ts
lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
```

Also update `test/tool-impact-ambiguous.test.ts` and `test/tool-trace-ambiguous.test.ts` to the new candidate row shape so the task-local and full-suite gates both pass.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-resolution-anchor-format.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.

### Task 7: Render symbol card anchors with separate file context [depends: 2, 3, 5]

Covers AC 10 for `symbolGraph` default/card output and part of AC 15.

**Files:**
- Modify: `src/tools/symbol-card.ts`
- Modify: `src/tools/symbol-contract.ts`
- Create: `test/tool-symbol-card-anchor-format.test.ts`
- Modify: `test/tool-symbol-card-happy.test.ts`
- Modify: `test/tool-symbol-contract-happy.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-symbol-card-anchor-format.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { symbolContract } from "../src/tools/symbol-contract.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("symbolGraph default card renders file-separated editable anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-card-public-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/foo.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(content), signature: "() => void" });

    const output = symbolGraph({ name: "foo", store, projectRoot });

    expect(output).toContain("## foo (function)");
    expect(output).toContain("src/foo.ts  1:c27");
    expect(output).not.toContain("src/foo.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard and symbolContract render file-separated anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-card-contract-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/foo.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(content), signature: "() => void" });

    const card = symbolCard({ name: "foo", store, projectRoot });
    const contract = symbolContract({ name: "foo", store, projectRoot });

    expect(card).toContain("src/foo.ts  1:c27");
    expect(contract).toContain("src/foo.ts  1:c27");
    expect(card).not.toContain("src/foo.ts:1:");
    expect(contract).not.toContain("src/foo.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Update existing card/contract happy-path tests in this task as well. Replace old assertions such as:

```ts
expect(output).toContain("src/a.ts:3:");
expect(output).toContain("src/validate.ts:1:");
```

with:

```ts
expect(output).toMatch(/src\/a\.ts  3:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/a\.ts:3:[0-9a-f]{4}/);
expect(output).toMatch(/src\/validate\.ts  1:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/validate\.ts:1:[0-9a-f]{4}/);
```

Run: `bun test test/tool-symbol-card-anchor-format.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` with `Expected substring: "src/foo.ts  1:c27"` because card and contract headers still render only `anchor.anchor`.

**Step 3 — Write minimal implementation**
In `src/tools/symbol-card.ts`, import the formatter:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
```

Replace every rendered direct anchor location with `formatAnchorLocation(...)`, including ambiguity rows, card headers, and covering test rows:

```ts
lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
lines.push(formatAnchorLocation(anchor));
lines.push(`  ${formatAnchorLocation(testAnchor)}  "${t.node.name}"`);
```

Apply those replacements in `renderSymbolSourceSection(...)`, `renderSymbolCardBody(...)`, and `symbolCard(...)`.

In `src/tools/symbol-contract.ts`, import the formatter:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
```

Replace contract ambiguity and header rows:

```ts
lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
lines.push(formatAnchorLocation(anchor));
```

Also update `test/tool-symbol-card-happy.test.ts` and `test/tool-symbol-contract-happy.test.ts` to remove old `file:line:hash` assertions for this surface before running the full suite.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-anchor-format.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.

### Task 8: Render impact anchors with separate file context [depends: 2, 3, 5]

Covers AC 11 and part of AC 15.

**Files:**
- Modify: `src/tools/impact.ts`
- Modify: `test/tool-impact-output-signals.test.ts`
- Modify: `test/extension-impact.test.ts`

**Step 1 — Write the failing test**
Update `test/tool-impact-output-signals.test.ts` assertion to require file-separated anchors:

```ts
expect(out).toMatch(
  /src\/caller\.ts  2:[0-9a-f]{3}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0\.00, chain-confidence:0\.80\]/,
);
expect(out).not.toMatch(/src\/caller\.ts:2:[0-9a-f]{4}/);
```

Also update `test/extension-impact.test.ts` impact-output assertions in this task. Replace:

```ts
expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:/);
expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]\n/);
```

with:

```ts
expect(out).toMatch(/src\/caller\.ts  2:[0-9a-f]{3}  caller  breaking  depth:1( \[stale\])?  \[fan-in:/);
expect(out).toMatch(/src\/caller\.ts  2:[0-9a-f]{3}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]\n/);
expect(out).not.toMatch(/src\/caller\.ts:2:[0-9a-f]{4}/);
```

Keep the existing setup that builds `shared` and `caller` nodes and the `calls` edge.

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-impact-output-signals.test.ts`
Expected: FAIL — `expect(received).toMatch(expected)` because the impact row renders the bare anchor without adjacent file context, e.g. `2:<3hex>  caller  breaking ...`, instead of `src/caller.ts  2:<3hex>  caller  breaking ...`.

**Step 3 — Write minimal implementation**
In `src/tools/impact.ts`, import `formatAnchorLocation`:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
```

Update the hit-row formatter:

```ts
const lines = hits.flatMap((hit) => {
  const node = params.store.getNode(hit.nodeId);
  if (!node) return [];
  const anchor = computeAnchor(node, params.projectRoot);
  const why = formatImpactWhy(hit.signals, hit.chainConfidence);
  return [
    `${formatAnchorLocation(anchor)}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${anchor.stale ? " [stale]" : ""}  ${why}`,
  ];
});

Also update `test/extension-impact.test.ts` so extension-level impact tests no longer expect the old `file:line:4hex` impact row shape.
```

This preserves classification, depth, stale marker, and why-signal text while separating file path from the bare editable anchor.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-impact-output-signals.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.

### Task 9: Render trace anchors with separate file context [depends: 2, 3, 5]

Covers AC 12 and part of AC 15.

**Files:**
- Modify: `src/tools/trace.ts`
- Modify: `test/tool-trace-static-fallback.test.ts`
- Modify: `test/tool-trace-coverage.test.ts`
- Modify: `test/tool-trace-signals.test.ts`
- Modify: `test/tool-trace-stale.test.ts`
- Modify: `test/tool-trace-static-mode-header.test.ts`
- Modify: `test/tool-trace-trust-heuristic.test.ts`

**Step 1 — Write the failing test**
Update `test/tool-trace-static-fallback.test.ts` with these assertions in the existing static fallback test and add the file-scoped miss test:

```ts
expect(output).toMatch(/src\/app\.ts  1:[0-9a-f]{3}  entry  function/);
expect(output).toMatch(/src\/app\.ts  2:[0-9a-f]{3}  first  function/);
expect(output).toMatch(/src\/app\.ts  3:[0-9a-f]{3}  second  function/);
expect(output).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
```

Add:

```ts
test("trace file-scoped miss candidates render file-separated editable anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-miss-anchor-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: createHash("sha256").update(content).digest("hex"),
    });

    const output = trace({ entry: "foo", file: "src/missing.ts", store, projectRoot });

    expect(output).toContain('Symbol "foo" was not found in src/missing.ts');
    expect(output).toContain("src/a.ts  1:c27  foo (function)");
    expect(output).not.toContain("src/a.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update existing trace output tests in this task as well. Replace old assertions such as:

```ts
expect(direct).toContain("src/app.test.ts:1:");
expect(lines[2]).toContain("src/app.ts:1:");
expect(lines.some((line) => /src\/app\.ts:1:[0-9a-f]{4}  prod  function/.test(line))).toBe(true);
```

with file-separated 3-hex assertions:

```ts
expect(direct).toMatch(/src\/app\.test\.ts  1:[0-9a-f]{3}/);
expect(lines[2]).toMatch(/src\/app\.ts  1:[0-9a-f]{3}/);
expect(lines.some((line) => /src\/app\.ts  1:[0-9a-f]{3}  prod  function/.test(line))).toBe(true);
expect(direct).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
```

Add `import { createHash } from "node:crypto";` if the file does not already have it.

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-static-fallback.test.ts`
Expected: FAIL — `expect(received).toMatch(expected)` for `/src\/app\.ts  1:[0-9a-f]{3}  entry  function/` because the trace line renders `1:<3hex>  entry  function ...` without the adjacent `src/app.ts` file context.

**Step 3 — Write minimal implementation**
In `src/tools/trace.ts`, import `formatAnchorLocation`:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
```

Update stored and live trace row rendering:

```ts
return {
  line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""} ${tags}`,
  stale,
};
```

```ts
return {
  line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""} ${tags}`,
  stale: anchor.stale,
};
```

Update file-scoped miss candidates:

```ts
Also update the existing old-shape assertions in `test/tool-trace-coverage.test.ts`, `test/tool-trace-signals.test.ts`, `test/tool-trace-stale.test.ts`, `test/tool-trace-static-mode-header.test.ts`, and `test/tool-trace-trust-heuristic.test.ts` before running the full suite.

lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
```

This preserves mode headers, names, kinds, role tags, and stale markers while separating file path from the bare editable anchor.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-static-fallback.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.

### Task 10: Render source snippets with compatible line hashes [depends: 1, 2]

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

### Task 11: Update anchor-format documentation [no-test] [depends: 1, 2, 3, 5, 6, 7, 8, 9, 10]

Covers AC 18, AC 19, AC 20.

**No-test justification:** Documentation-only task. It changes no runtime behavior and is verified with targeted documentation grep plus the normal typecheck/test suite.

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `AGENTS.md`
- Modify: `VISION.md`

**Step 1 — Documentation verification before implementation**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts test/docs-closed-enum-drift.test.ts`
Expected: PASS for existing docs tests, but manual grep still finds stale claims such as:

```md
Every node in every response carries `file:line:hash`. The agent can edit any result immediately. No translation layer between "understanding" and "acting."
```

**Step 2 — Expected stale-doc evidence**
Run: `grep -R "file:line:hash\|edit any result immediately\|No re-reading\|No translation layer" README.md ARCHITECTURE.md AGENTS.md VISION.md`
Expected: FAIL for the documentation contract — output includes stale old-format claims in root docs, especially `VISION.md` and `AGENTS.md`.

**Step 3 — Update documentation**
In `README.md`, replace any old editable-anchor wording with:

```md
Editable anchor locations are rendered as two adjacent fields: the file path as context, then a bare `LINE:HASH` token, for example `src/a.ts  10:abc`. The `LINE:HASH` token uses the same whitespace-insensitive xxhash line-hash algorithm as pi-hashline-readmap.

The graph can point an agent to the right file and line, but pi-hashline-readmap's read-before-edit/file-anchoring gate still applies. Codegraph does not provide true edit-without-prior-read anchoring.
```

In `ARCHITECTURE.md`, distinguish the two hash concepts:

```md
- `content_hash` is a whole-file SHA-256 value used for staleness and incremental indexing.
- Editable line anchors are not stored in SQLite. They are computed from current on-disk line content at render time as bare `LINE:HASH` tokens and displayed next to the file path, e.g. `src/a.ts  10:abc`.
```

In `AGENTS.md`, replace the old tool-output statement with:

```md
Tool output is hashline-compatible: file paths are rendered as separate context fields next to bare editable `LINE:HASH` anchors. The line hash is the local pi-hashline-compatible 3-hex xxhash value. Whole-file `content_hash` values remain SHA-256 freshness markers.
```

In `VISION.md`, replace:

```md
Every node in every response carries `file:line:hash`. The agent can edit any result immediately. No translation layer between "understanding" and "acting."
```

with:

```md
Every node in editable output carries the file path as context plus a bare `LINE:HASH` anchor token that matches pi's hashline format, for example `src/a.ts  10:abc`. That makes the location actionable after pi-hashline-readmap has anchored the file through its normal read/grep/ast_search/write gate; codegraph does not bypass the read-before-edit requirement.
```

**Step 4 — Verify documentation checks pass**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts test/docs-closed-enum-drift.test.ts`
Expected: PASS

Then verify no stale root-doc claims remain:

```sh
grep -R "file:line:hash\|edit any result immediately\|No re-reading\|No translation layer" README.md ARCHITECTURE.md AGENTS.md VISION.md
```

Expected: no matches for stale editable-anchor claims. If the grep returns matches in historical context, rewrite them to mention separate `file path` plus bare `LINE:HASH` and the read-before-edit caveat.

**Step 5 — Verify no regressions**
Run: `bun run check && bun test`
Expected: PASS — typecheck and all tests passing.
