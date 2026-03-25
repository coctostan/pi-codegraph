# Plan

### Task 1: readSourceSnippet utility — happy path

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

### Task 2: readSourceSnippet — missing file returns null [depends: 1]

### Task 2: readSourceSnippet — missing file returns null [depends: 1]

**Files:**
- Modify: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**

Add to `test/read-source-snippet.test.ts`:

```typescript
test("readSourceSnippet returns null when file does not exist on disk", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-missing-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const node: GraphNode = {
    id: "src/gone.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/gone.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "abc123",
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).toBeNull();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS — this case is already handled by the `!existsSync(fullPath)` check in Task 1. The test simply documents the behavior.

Note: this test passes immediately because the implementation from Task 1 already returns `null` for missing files. This is a documentation test confirming AC 5.

**Step 3 — No additional implementation needed**

Already handled in Task 1.

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 376 tests passing

### Task 3: readSourceSnippet — null end_line returns null [depends: 1]

### Task 3: readSourceSnippet — null end_line returns null [depends: 1]

**Files:**
- Modify: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**

Add to `test/read-source-snippet.test.ts`:

```typescript
test("readSourceSnippet returns null when end_line is null", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-nullend-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: null,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).toBeNull();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS — the `end_line == null` guard in Task 1 already handles this. This is a documentation test confirming AC 6.

**Step 3 — No additional implementation needed**

Already handled in Task 1.

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 377 tests passing

### Task 4: readSourceSnippet — truncation with maxLines [depends: 1]

### Task 4: readSourceSnippet — truncation with maxLines [depends: 1]

**Files:**
- Modify: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**

Add to `test/read-source-snippet.test.ts`:

```typescript
test("readSourceSnippet truncates when source exceeds maxLines", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-trunc-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
  const fileContent = lines.join("\n") + "\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 20,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot, 5);
    expect(result).not.toBeNull();
    expect(result!.truncated).toBe(15);
    expect(result!.text).toContain("line 1");
    expect(result!.text).toContain("line 5");
    expect(result!.text).not.toContain("line 6");
    expect(result!.text).toContain("(15 more lines truncated)");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS — truncation logic is already in Task 1. This documents the truncation behavior per AC 3.

**Step 3 — No additional implementation needed**

Already handled in Task 1.

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 378 tests passing

### Task 5: readSourceSnippet — stale detection [depends: 1]

### Task 5: readSourceSnippet — stale detection [depends: 1]

**Files:**
- Modify: `test/read-source-snippet.test.ts`

**Step 1 — Write the failing test**

Add to `test/read-source-snippet.test.ts`:

```typescript
test("readSourceSnippet sets stale=true when content hash mismatches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "old-stale-hash",
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).not.toBeNull();
    expect(result!.stale).toBe(true);
    // Should still contain the source
    expect(result!.text).toContain("export function foo()");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readSourceSnippet sets stale=false when content hash matches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-fresh-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).not.toBeNull();
    expect(result!.stale).toBe(false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS — stale detection is already in Task 1. This documents the stale behavior per AC 7.

**Step 3 — No additional implementation needed**

Already handled in Task 1.

**Step 4 — Run test, verify it passes**
Run: `bun test test/read-source-snippet.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 380 tests passing

### Task 6: symbolCard — add Source section with hashlined content [depends: 1]

### Task 6: symbolCard — add Source section with hashlined content [depends: 1]

**Files:**
- Modify: `src/tools/symbol-card.ts`
- Create: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-card-source.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard includes ### Source section with hashlined content", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "// header\nexport function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:2",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 2,
      end_line: 4,
      content_hash: hash,
      is_exported: true,
      signature: "() => number",
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    // Should contain Source section
    expect(output).toContain("### Source");
    // Should contain hashlined content
    expect(output).toMatch(/2:[a-f0-9]+\|export function foo/);
    expect(output).toMatch(/3:[a-f0-9]+\|  return 1;/);
    expect(output).toMatch(/4:[a-f0-9]+\|}/);

    // Source should appear before Signature
    const sourceIdx = output.indexOf("### Source");
    const sigIdx = output.indexOf("### Signature");
    expect(sourceIdx).toBeGreaterThan(-1);
    expect(sigIdx).toBeGreaterThan(-1);
    expect(sourceIdx).toBeLessThan(sigIdx);

    // Existing sections still present
    expect(output).toContain("## foo (function)");
    expect(output).toContain("### Exported");
    expect(output).toContain("### Signals");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected "### Source" to be in the output`

**Step 3 — Write minimal implementation**

Modify `src/tools/symbol-card.ts`:

```typescript
import type { GraphStore, NeighborResult } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatRoleTags } from "../output/signals.js";
import { readSourceSnippet } from "../output/source.js";
import { prependTrustHeader } from "../output/trust.js";

export interface SymbolCardParams {
  name: string;
  file?: string;
  maxSourceLines?: number;
  store: GraphStore;
  projectRoot: string;
}

export function symbolCard(params: SymbolCardParams): string {
  const { name, file, store, projectRoot, maxSourceLines } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return prependTrustHeader(`Symbol "${name}" not found`, { stats });
  }

  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    const hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
    return prependTrustHeader(body, { stats, hasLocalExceptions });
  }

  const node = nodes[0]!;
  const anchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const signals = signalComputer.compute(node.id);
  const allNeighbors = store.getNeighbors(node.id).filter(
    (nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"),
  );

  const lines: string[] = [];

  // Header
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(anchor.anchor);

  // Source
  const snippet = readSourceSnippet(node, projectRoot, maxSourceLines);
  lines.push("");
  lines.push("### Source");
  if (snippet) {
    if (snippet.stale) {
      lines[lines.length - 1] = "### Source [stale]";
    }
    lines.push(snippet.text);
  } else {
    lines.push("source unavailable");
  }

  // Signature
  lines.push("");
  lines.push("### Signature");
  lines.push(node.signature ?? "not available");

  // Exported
  lines.push("");
  lines.push("### Exported");
  lines.push(node.is_exported ? "yes" : "no");

  // Covering Tests
  const tests = allNeighbors.filter(
    (nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id,
  );
  if (tests.length > 0) {
    lines.push("");
    lines.push(`### Covering Tests (${tests.length})`);
    for (const t of tests) {
      const testAnchor = computeAnchor(t.node, projectRoot);
      lines.push(`  ${testAnchor.anchor}  "${t.node.name}"`);
    }
  }

  // Key Relationships
  const callers = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.target === node.id);
  const callees = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.source === node.id);
  const imports = allNeighbors.filter((nr) => nr.edge.kind === "imports" && nr.edge.source === node.id);
  const extendsOut = allNeighbors.filter((nr) => nr.edge.kind === "extends" && nr.edge.source === node.id);
  const implementsOut = allNeighbors.filter((nr) => nr.edge.kind === "implements" && nr.edge.source === node.id);

  const relSections: string[] = [];
  if (callers.length > 0) relSections.push(formatRelGroup("Callers", callers));
  if (callees.length > 0) relSections.push(formatRelGroup("Callees", callees));
  if (imports.length > 0) relSections.push(formatRelGroup("Imports", imports));
  if (extendsOut.length > 0) relSections.push(formatRelGroup("Extends", extendsOut));
  if (implementsOut.length > 0) relSections.push(formatRelGroup("Implements", implementsOut));

  if (relSections.length > 0) {
    lines.push("");
    lines.push("### Key Relationships");
    lines.push(...relSections);
  }

  // Signals
  lines.push("");
  lines.push("### Signals");
  lines.push(formatRoleTags(signals));

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats, hasLocalExceptions: anchor.stale || (snippet?.stale ?? false) });
}

function formatRelGroup(label: string, neighbors: NeighborResult[]): string {
  const names = neighbors.slice(0, 5).map((nr) => nr.node.name);
  const suffix = neighbors.length > 5 ? ` (+${neighbors.length - 5} more)` : "";
  return `  ${label} (${neighbors.length}):  ${names.join(", ")}${suffix}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 381 tests passing

### Task 7: symbolCard — Source section shows "source unavailable" when file missing [depends: 6]

### Task 7: symbolCard — Source section shows "source unavailable" when file missing [depends: 6]

**Files:**
- Modify: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

Add to `test/tool-symbol-card-source.test.ts`:

```typescript
test("symbolCard Source section shows 'source unavailable' when file does not exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-missing-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/gone.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/gone.ts",
      start_line: 1,
      end_line: 5,
      content_hash: "abc123",
      is_exported: true,
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Source");
    expect(output).toContain("source unavailable");
    // Should NOT crash or have empty section
    expect(output).toContain("### Signature");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS — already handled by the null check in Task 6. Documents AC 5.

**Step 3 — No additional implementation needed**

Already handled in Task 6.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 382 tests passing

### Task 8: symbolCard — Source section shows "source unavailable" when end_line is null [depends: 6]

### Task 8: symbolCard — Source section shows "source unavailable" when end_line is null [depends: 6]

**Files:**
- Modify: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

Add to `test/tool-symbol-card-source.test.ts`:

```typescript
test("symbolCard Source section shows 'source unavailable' when end_line is null", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-nullend-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: null,
      content_hash: hash,
      is_exported: true,
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Source");
    expect(output).toContain("source unavailable");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS — already handled by readSourceSnippet returning null. Documents AC 6.

**Step 3 — No additional implementation needed**

Already handled in Tasks 1 + 6.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 383 tests passing

### Task 9: symbolCard — Source section shows [stale] marker on hash mismatch [depends: 6]

### Task 9: symbolCard — Source section shows [stale] marker on hash mismatch [depends: 6]

**Files:**
- Modify: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

Add to `test/tool-symbol-card-source.test.ts`:

```typescript
test("symbolCard Source section header includes [stale] when content hash mismatches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "old-stale-hash",
      is_exported: true,
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Source [stale]");
    // Source content should still be present
    expect(output).toContain("export function foo()");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS — already handled by the `snippet.stale` check in Task 6. Documents AC 7.

**Step 3 — No additional implementation needed**

Already handled in Task 6.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 384 tests passing

### Task 10: symbolCard — maxSourceLines truncates source output [depends: 6]

### Task 10: symbolCard — maxSourceLines truncates source output [depends: 6]

**Files:**
- Modify: `test/tool-symbol-card-source.test.ts`

**Step 1 — Write the failing test**

Add to `test/tool-symbol-card-source.test.ts`:

```typescript
test("symbolCard truncates source when maxSourceLines is provided", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-max-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const lines = Array.from({ length: 20 }, (_, i) => `  statement_${i + 1};`);
  const fileContent = `function bigFn() {\n${lines.join("\n")}\n}\n`;
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::bigFn:1",
      kind: "function",
      name: "bigFn",
      file: "src/a.ts",
      start_line: 1,
      end_line: 22,
      content_hash: hash,
      is_exported: true,
    });

    const output = symbolCard({ name: "bigFn", store, projectRoot, maxSourceLines: 3 });

    expect(output).toContain("### Source");
    // Should contain first 3 lines
    expect(output).toContain("function bigFn()");
    expect(output).toContain("statement_1");
    expect(output).toContain("statement_2");
    // Should NOT contain line 4+
    expect(output).not.toContain("statement_3");
    // Should show truncation indicator
    expect(output).toContain("more lines truncated)");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS — `maxSourceLines` is already wired in Task 6. Documents AC 3 and AC 12.

**Step 3 — No additional implementation needed**

Already handled in Tasks 1 + 6.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-source.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 385 tests passing

### Task 11: symbolCard — neighbor signatures in Key Relationships [depends: 6]

### Task 11: symbolCard — neighbor signatures in Key Relationships [depends: 6]

**Files:**
- Modify: `src/tools/symbol-card.ts`
- Create: `test/tool-symbol-card-neighbor-sigs.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-card-neighbor-sigs.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard shows neighbor signatures in Key Relationships", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nbsig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() { bar(); }\n";
  const fileBContent = "export function bar(x: number): string { return String(x); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  const hashA = sha256Hex(fileAContent);
  const hashB = sha256Hex(fileBContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts",
      start_line: 1, end_line: 1, content_hash: hashA, is_exported: true,
      signature: "() => void",
    });
    store.addNode({
      id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts",
      start_line: 1, end_line: 1, content_hash: hashB, is_exported: true,
      signature: "(x: number) => string",
    });
    // foo calls bar
    store.addEdge({
      source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Key Relationships");
    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    // Neighbor signature should appear
    expect(output).toContain("(x: number) => string");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard omits signature line for neighbors without a signature", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nbnosig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() { bar(); }\n";
  const fileBContent = "export function bar() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  const hashA = sha256Hex(fileAContent);
  const hashB = sha256Hex(fileBContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts",
      start_line: 1, end_line: 1, content_hash: hashA, is_exported: true,
    });
    // bar has NO signature
    store.addNode({
      id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts",
      start_line: 1, end_line: 1, content_hash: hashB, is_exported: true,
    });
    store.addEdge({
      source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    // Should NOT have "not available" for neighbor signature
    // Count occurrences of "not available" — only the foo's own signature section should have it
    const relSection = output.slice(output.indexOf("### Key Relationships"));
    expect(relSection).not.toContain("not available");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-neighbor-sigs.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected "(x: number) => string" to be in the output`

**Step 3 — Write minimal implementation**

Modify `formatRelGroup` in `src/tools/symbol-card.ts`:

```typescript
function formatRelGroup(label: string, neighbors: NeighborResult[]): string {
  const top = neighbors.slice(0, 5);
  const lines: string[] = [];
  const names = top.map((nr) => nr.node.name);
  const suffix = neighbors.length > 5 ? ` (+${neighbors.length - 5} more)` : "";
  lines.push(`  ${label} (${neighbors.length}):  ${names.join(", ")}${suffix}`);
  for (const nr of top) {
    if (nr.node.signature) {
      lines.push(`    ${nr.node.name}: ${nr.node.signature}`);
    }
  }
  return lines.join("\n");
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-neighbor-sigs.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 387 tests passing

### Task 12: Typebox schema — add maxSourceLines parameter to index.ts [no-test] [depends: 6]

### Task 12: Typebox schema — add maxSourceLines parameter to index.ts [depends: 6] [no-test]

**Justification:** Schema-only change in `index.ts` — the Typebox param definition and its wiring to the `symbolCard` function call. Behavioral correctness is covered by the integration tests in Tasks 6–10 via the `symbolCard` function directly.

**Files:**
- Modify: `src/index.ts`

**Step 1 — Make the change**

In `src/index.ts`, update the `SymbolCardParams` Typebox schema (around line 71):

```typescript
const SymbolCardParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  maxSourceLines: Type.Optional(Type.Number({ description: "Maximum lines of source to inline (default: 50)" })),
});
```

And update the `execute` handler (around line 313) to pass through the param:

```typescript
      let output = symbolCard({ name: params.name, file: params.file, maxSourceLines: params.maxSourceLines, store, projectRoot });
```

**Step 2 — Verify**
Run: `bun build src/index.ts --no-bundle 2>&1 | head -20`
Expected: no type errors

Run: `bun test`
Expected: all tests passing
