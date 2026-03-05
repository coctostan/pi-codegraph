# Plan

### Task 1: findNodes returns all nodes matching a name

**Spec criteria:** 1, 2, 4

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-find-nodes.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/graph-store-find-nodes.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("findNodes returns all nodes matching a name across files", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });

  store.addNode({
    id: "src/b.ts::foo:5",
    kind: "function",
    name: "foo",
    file: "src/b.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
  });

  store.addNode({
    id: "src/a.ts::bar:10",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    content_hash: "h3",
  });

  const results = store.findNodes("foo");
  expect(results).toHaveLength(2);
  expect(results.map((n) => n.id).sort()).toEqual([
    "src/a.ts::foo:1",
    "src/b.ts::foo:5",
  ]);

  store.close();
});

test("findNodes returns empty array for nonexistent name", () => {
  const store = new SqliteGraphStore();
  const results = store.findNodes("nonexistent");
  expect(results).toEqual([]);
  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-find-nodes.test.ts`
Expected: FAIL — TypeError: store.findNodes is not a function

**Step 3 — Write minimal implementation**

In `src/graph/store.ts`, add `findNodes` to the `GraphStore` interface:

```typescript
import type { EdgeKind, GraphEdge, GraphNode } from "./types.js";

export interface NeighborOptions {
  kind?: EdgeKind;
  direction?: "in" | "out" | "both";
}

export interface NeighborResult {
  node: GraphNode;
  edge: GraphEdge;
}

export interface GraphStore {
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | null;
  findNodes(name: string, file?: string): GraphNode[];
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
  getNodesByFile(file: string): GraphNode[];
  deleteFile(file: string): void;
  listFiles(): string[];
  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  close(): void;
}
```

In `src/graph/sqlite.ts`, add the `findNodes` method to `SqliteGraphStore`:

```typescript
findNodes(name: string, file?: string): GraphNode[] {
  const sql = file
    ? `SELECT id, kind, name, file, start_line, end_line, content_hash
       FROM nodes WHERE name = ? AND file = ?`
    : `SELECT id, kind, name, file, start_line, end_line, content_hash
       FROM nodes WHERE name = ?`;

  const rows = (file
    ? this.db.query(sql).all(name, file)
    : this.db.query(sql).all(name)) as Array<{
    id: string;
    kind: GraphNode["kind"];
    name: string;
    file: string;
    start_line: number;
    end_line: number | null;
    content_hash: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    file: row.file,
    start_line: row.start_line,
    end_line: row.end_line,
    content_hash: row.content_hash,
  }));
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-find-nodes.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: findNodes filters by file when provided [depends: 1]

**Spec criteria:** 3

**Files:**
- Test: `test/graph-store-find-nodes.test.ts`

**Step 1 — Write the failing test**

Append to `test/graph-store-find-nodes.test.ts`:

```typescript
test("findNodes filters by file when file parameter is provided", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });

  store.addNode({
    id: "src/b.ts::foo:5",
    kind: "function",
    name: "foo",
    file: "src/b.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
  });

  const results = store.findNodes("foo", "src/a.ts");
  expect(results).toHaveLength(1);
  expect(results[0]!.id).toBe("src/a.ts::foo:1");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-find-nodes.test.ts`
Expected: PASS — This test should already pass because the `findNodes` implementation from Task 1 already handles the `file` parameter. This test documents and verifies criterion 3.

**Step 3 — No additional implementation needed**

The `findNodes` implementation from Task 1 already includes the `AND file = ?` conditional. This test exists to explicitly cover spec criterion 3.

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-find-nodes.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: computeAnchor returns file:line:hash for a fresh node

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

### Task 4: computeAnchor marks stale when file content changed [depends: 3]

**Spec criteria:** 7

**Files:**
- Test: `test/output-compute-anchor.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-compute-anchor.test.ts`:

```typescript
test("computeAnchor returns stale=true when file content hash differs from node", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const originalContent = "line one\nexport function foo() {}\nline three";
  const modifiedContent = "line one\nexport function foo() { return 1; }\nline three";
  const filePath = "src/a.ts";

  // Write the modified file but use hash of original
  writeFileSync(join(projectRoot, filePath), modifiedContent);

  const node = {
    id: "src/a.ts::foo:2",
    kind: "function" as const,
    name: "foo",
    file: filePath,
    start_line: 2,
    end_line: 2,
    content_hash: sha256Hex(originalContent), // hash of original, not current
  };

  const result = computeAnchor(node, projectRoot);

  // Still produces an anchor from the current file content
  const currentLine = "export function foo() { return 1; }";
  const expectedLineHash = sha256Hex(currentLine.trim()).slice(0, 4);
  expect(result.anchor).toBe(`src/a.ts:2:${expectedLineHash}`);
  expect(result.stale).toBe(true);

  rmSync(projectRoot, { recursive: true, force: true });
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS — This should already pass since Task 3 implementation handles stale detection. This test explicitly covers spec criterion 7 (stale=true with best-effort anchor).

**Step 3 — No additional implementation needed**

The `computeAnchor` from Task 3 already compares `currentHash !== node.content_hash` and still produces a valid anchor from the current file.

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: computeAnchor returns stale with ? hash when file missing [depends: 3]

**Spec criteria:** 8

**Files:**
- Test: `test/output-compute-anchor.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-compute-anchor.test.ts`:

```typescript
test("computeAnchor returns stale=true with ? hash when file does not exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-missing-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const node = {
    id: "src/gone.ts::foo:5",
    kind: "function" as const,
    name: "foo",
    file: "src/gone.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "doesnotmatter",
  };

  const result = computeAnchor(node, projectRoot);

  expect(result.anchor).toBe("src/gone.ts:5:?");
  expect(result.stale).toBe(true);

  rmSync(projectRoot, { recursive: true, force: true });
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS — This should already pass since Task 3 implementation handles missing files with `existsSync` check. This test explicitly covers spec criterion 8.

**Step 3 — No additional implementation needed**

The `computeAnchor` from Task 3 already checks `existsSync(fullPath)` and returns `{ anchor: "file:line:?", stale: true }`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-compute-anchor.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: rankNeighbors sorts by confidence and truncates to limit [depends: 3]

**Spec criteria:** 10, 11

**Files:**
- Modify: `src/output/anchoring.ts`
- Create: `test/output-rank-neighbors.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/output-rank-neighbors.test.ts
import { expect, test } from "bun:test";
import { rankNeighbors } from "../src/output/anchoring.js";
import type { NeighborResult } from "../src/graph/store.js";

function makeNeighbor(name: string, confidence: number, createdAt: number = 1000): NeighborResult {
  return {
    node: {
      id: `src/a.ts::${name}:1`,
      kind: "function",
      name,
      file: "src/a.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "h1",
    },
    edge: {
      source: `src/a.ts::${name}:1`,
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "tree-sitter",
        confidence,
        evidence: "direct call",
        content_hash: "eh1",
      },
      created_at: createdAt,
    },
  };
}

test("rankNeighbors sorts by confidence descending and truncates to limit", () => {
  const neighbors: NeighborResult[] = [
    makeNeighbor("low", 0.3),
    makeNeighbor("high", 0.9),
    makeNeighbor("mid1", 0.5),
    makeNeighbor("mid2", 0.5),
    makeNeighbor("top", 1.0),
  ];

  const result = rankNeighbors(neighbors, 3);

  expect(result.kept).toHaveLength(3);
  expect(result.kept[0]!.node.name).toBe("top");
  expect(result.kept[1]!.node.name).toBe("high");
  // Third is one of the mid (0.5) — exact order tested in Task 7
  expect(result.kept[2]!.edge.provenance.confidence).toBe(0.5);
  expect(result.omitted).toBe(2);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: FAIL — TypeError: rankNeighbors is not a function (or import error)

**Step 3 — Write minimal implementation**

Add to `src/output/anchoring.ts`:

```typescript
import type { NeighborResult } from "../graph/store.js";

export interface RankResult {
  kept: NeighborResult[];
  omitted: number;
}

export function rankNeighbors(neighbors: NeighborResult[], limit: number): RankResult {
  const sorted = [...neighbors].sort((a, b) => {
    const confDiff = b.edge.provenance.confidence - a.edge.provenance.confidence;
    if (confDiff !== 0) return confDiff;
    return b.edge.created_at - a.edge.created_at;
  });

  const kept = sorted.slice(0, limit);
  return {
    kept,
    omitted: sorted.length - kept.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: rankNeighbors breaks confidence ties by created_at descending [depends: 6]

**Spec criteria:** 13

**Files:**
- Test: `test/output-rank-neighbors.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-rank-neighbors.test.ts`:

```typescript
test("rankNeighbors breaks confidence ties by created_at descending (newer first)", () => {
  const neighbors: NeighborResult[] = [
    makeNeighbor("older", 0.5, 1000),
    makeNeighbor("newer", 0.5, 2000),
    makeNeighbor("newest", 0.5, 3000),
  ];

  const result = rankNeighbors(neighbors, 3);

  expect(result.kept[0]!.node.name).toBe("newest");
  expect(result.kept[1]!.node.name).toBe("newer");
  expect(result.kept[2]!.node.name).toBe("older");
  expect(result.omitted).toBe(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS — The implementation from Task 6 already includes the `created_at` tiebreaker. This test explicitly verifies the behavior.

**Step 3 — No additional implementation needed**

Task 6 implementation sorts by `b.edge.created_at - a.edge.created_at` when confidence is equal.

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 8: rankNeighbors returns all items when count is within limit [depends: 6]

**Spec criteria:** 12

**Files:**
- Test: `test/output-rank-neighbors.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-rank-neighbors.test.ts`:

```typescript
test("rankNeighbors returns all items with omitted=0 when within limit", () => {
  const neighbors: NeighborResult[] = [
    makeNeighbor("a", 0.8),
    makeNeighbor("b", 0.6),
  ];

  const result = rankNeighbors(neighbors, 10);

  expect(result.kept).toHaveLength(2);
  expect(result.kept[0]!.node.name).toBe("a");
  expect(result.kept[1]!.node.name).toBe("b");
  expect(result.omitted).toBe(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS — Task 6 implementation already handles this. This test covers spec criterion 12 explicitly.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 9: formatNeighborhood produces header and neighbor sections [depends: 3, 6]

**Spec criteria:** 14, 15, 16, 18

**Files:**
- Modify: `src/output/anchoring.ts`
- Create: `test/output-format-neighborhood.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/output-format-neighborhood.test.ts
import { expect, test } from "bun:test";
import { formatNeighborhood } from "../src/output/anchoring.js";
import type { AnchorResult } from "../src/output/anchoring.js";

interface AnchoredNeighbor {
  anchor: AnchorResult;
  name: string;
  edgeKind: string;
  confidence: number;
  provenanceSource: string;
}

test("formatNeighborhood produces header and populated sections, omits empty ones", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [
      {
        anchor: { anchor: "src/b.ts:5:1234", stale: false },
        name: "caller1",
        edgeKind: "calls",
        confidence: 0.9,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  const callees: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [
      {
        anchor: { anchor: "src/c.ts:20:5678", stale: false },
        name: "callee1",
        edgeKind: "calls",
        confidence: 0.5,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  // Empty imports — should be omitted from output
  const imports: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [],
    omitted: 0,
  };

  const unresolved: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [],
    omitted: 0,
  };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved
  );

  // Has header
  expect(output).toContain("myFunc (function)");
  expect(output).toContain("src/a.ts:10:abcd");

  // Has callers section
  expect(output).toContain("Callers");
  expect(output).toContain("src/b.ts:5:1234");
  expect(output).toContain("caller1");
  expect(output).toContain("0.9");
  expect(output).toContain("tree-sitter");

  // Has callees section
  expect(output).toContain("Callees");
  expect(output).toContain("src/c.ts:20:5678");
  expect(output).toContain("callee1");

  // No imports section (empty)
  expect(output).not.toContain("Imports");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: FAIL — TypeError: formatNeighborhood is not a function (or import error)

**Step 3 — Write minimal implementation**

Add to `src/output/anchoring.ts`:

```typescript
export interface AnchoredNeighbor {
  anchor: AnchorResult;
  name: string;
  edgeKind: string;
  confidence: number;
  provenanceSource: string;
}

export interface NeighborSection {
  items: AnchoredNeighbor[];
  omitted: number;
}

export interface SymbolHeader {
  name: string;
  kind: string;
  anchor: AnchorResult;
}

function formatSection(title: string, section: NeighborSection): string {
  if (section.items.length === 0 && section.omitted === 0) return "";

  const lines: string[] = [];
  lines.push(`\n### ${title}`);

  for (const item of section.items) {
    const staleMarker = item.anchor.stale ? " [stale]" : "";
    lines.push(
      `  ${item.anchor.anchor}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}`
    );
  }

  if (section.omitted > 0) {
    lines.push(`  (${section.omitted} more omitted)`);
  }

  return lines.join("\n");
}

export function formatNeighborhood(
  symbol: SymbolHeader,
  callers: NeighborSection,
  callees: NeighborSection,
  imports: NeighborSection,
  unresolved: NeighborSection
): string {
  const staleMarker = symbol.anchor.stale ? " [stale]" : "";
  const header = `## ${symbol.name} (${symbol.kind})\n${symbol.anchor.anchor}${staleMarker}`;

  const sections = [
    formatSection("Callers", callers),
    formatSection("Callees", callees),
    formatSection("Imports", imports),
    formatSection("Unresolved", unresolved),
  ]
    .filter((s) => s.length > 0)
    .join("\n");

  return `${header}${sections}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 10: formatNeighborhood shows omission counts when truncated [depends: 9]

**Spec criteria:** 17

**Files:**
- Test: `test/output-format-neighborhood.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-format-neighborhood.test.ts`:

```typescript
test("formatNeighborhood shows (N more omitted) when a category is truncated", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers = {
    items: [
      {
        anchor: { anchor: "src/b.ts:5:1234", stale: false } as AnchorResult,
        name: "caller1",
        edgeKind: "calls",
        confidence: 0.9,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 5,
  };

  const callees = { items: [], omitted: 0 };
  const imports = { items: [], omitted: 0 };
  const unresolved = { items: [], omitted: 0 };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved
  );

  expect(output).toContain("(5 more omitted)");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS — Task 9 implementation already renders `(N more omitted)`. This test explicitly covers spec criterion 17.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 11: formatNeighborhood suffixes stale entries with [stale] [depends: 9]

**Spec criteria:** 19

**Files:**
- Test: `test/output-format-neighborhood.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-format-neighborhood.test.ts`:

```typescript
test("formatNeighborhood suffixes stale entries with [stale]", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers = {
    items: [
      {
        anchor: { anchor: "src/b.ts:5:1234", stale: true } as AnchorResult,
        name: "staleCaller",
        edgeKind: "calls",
        confidence: 0.9,
        provenanceSource: "tree-sitter",
      },
      {
        anchor: { anchor: "src/c.ts:8:5678", stale: false } as AnchorResult,
        name: "freshCaller",
        edgeKind: "calls",
        confidence: 0.8,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  const callees = { items: [], omitted: 0 };
  const imports = { items: [], omitted: 0 };
  const unresolved = { items: [], omitted: 0 };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved
  );

  // Stale entry has [stale] marker
  const staleCallerLine = output.split("\n").find((l) => l.includes("staleCaller"));
  expect(staleCallerLine).toContain("[stale]");

  // Fresh entry does not
  const freshCallerLine = output.split("\n").find((l) => l.includes("freshCaller"));
  expect(freshCallerLine).not.toContain("[stale]");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS — Task 9 implementation already appends `[stale]` when `item.anchor.stale` is true. This test explicitly covers spec criterion 19.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 12: formatNeighborhood shows unresolved section for __unresolved__ nodes [depends: 9]

**Spec criteria:** 20

**Files:**
- Test: `test/output-format-neighborhood.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-format-neighborhood.test.ts`:

```typescript
test("formatNeighborhood shows Unresolved section for __unresolved__ nodes", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers = { items: [], omitted: 0 };
  const callees = { items: [], omitted: 0 };
  const imports = { items: [], omitted: 0 };

  const unresolved = {
    items: [
      {
        anchor: { anchor: "__unresolved__::Parser:0:?", stale: true } as AnchorResult,
        name: "Parser",
        edgeKind: "calls",
        confidence: 0.5,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved
  );

  expect(output).toContain("Unresolved");
  expect(output).toContain("Parser");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS — Task 9 implementation handles the unresolved section via `formatSection("Unresolved", unresolved)`. This test covers spec criterion 20.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-format-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 13: symbolGraph returns full neighborhood for unique symbol match [depends: 1, 9]

**Spec criteria:** 14, 21, 25, 26

**Files:**
- Modify: `src/tools/symbol-graph.ts`
- Create: `test/tool-symbol-graph.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-graph.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function setupFixture(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-sg-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  writeFileSync(
    join(projectRoot, "src/a.ts"),
    "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n"
  );
  writeFileSync(
    join(projectRoot, "src/b.ts"),
    "export function bar() {\n  return 1;\n}\n"
  );

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

test("symbolGraph returns full neighborhood for a unique symbol match", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    // Add nodes
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    // foo calls bar (outgoing edge from foo)
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "foo", store, projectRoot });

    // Header
    expect(output).toContain("foo (function)");
    expect(output).toContain("src/a.ts:3:");

    // Callees section with bar
    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    expect(output).toContain("src/b.ts:1:");
    expect(output).toContain("0.5");
    expect(output).toContain("tree-sitter");

    // No callers for foo
    expect(output).not.toContain("Callers");

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: FAIL — the current `symbolGraph` is a no-op stub returning undefined

**Step 3 — Write minimal implementation**

Replace `src/tools/symbol-graph.ts`:

```typescript
import type { GraphStore, NeighborResult } from "../graph/store.js";
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  type AnchoredNeighbor,
  type NeighborSection,
} from "../output/anchoring.js";

export interface SymbolGraphParams {
  name: string;
  file?: string;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}

function toAnchoredNeighbor(
  nr: NeighborResult,
  projectRoot: string
): AnchoredNeighbor {
  const anchor = computeAnchor(nr.node, projectRoot);
  return {
    anchor,
    name: nr.node.name,
    edgeKind: nr.edge.kind,
    confidence: nr.edge.provenance.confidence,
    provenanceSource: nr.edge.provenance.source,
  };
}

function buildSection(
  neighbors: NeighborResult[],
  limit: number,
  projectRoot: string
): NeighborSection {
  const ranked = rankNeighbors(neighbors, limit);
  return {
    items: ranked.kept.map((nr) => toAnchoredNeighbor(nr, projectRoot)),
    omitted: ranked.omitted,
  };
}

export function symbolGraph(params: SymbolGraphParams): string {
  const { name, file, limit = 10, store, projectRoot } = params;

  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return `Symbol "${name}" not found`;
  }

  if (nodes.length > 1) {
    // Disambiguation list
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    return lines.join("\n") + "\n";
  }

  const node = nodes[0]!;
  const symbolAnchor = computeAnchor(node, projectRoot);

  const allNeighbors = store.getNeighbors(node.id);

  // Bucket by direction and kind
  const callerResults: NeighborResult[] = [];
  const calleeResults: NeighborResult[] = [];
  const importResults: NeighborResult[] = [];
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of allNeighbors) {
    // Check if unresolved
    if (nr.node.file.startsWith("__unresolved__")) {
      unresolvedResults.push(nr);
      continue;
    }

    if (nr.edge.kind === "calls") {
      if (nr.edge.target === node.id) {
        // Incoming call: this neighbor calls our symbol
        callerResults.push(nr);
      } else {
        // Outgoing call: our symbol calls this neighbor
        calleeResults.push(nr);
      }
    } else if (nr.edge.kind === "imports") {
      importResults.push(nr);
    }
  }

  const callers = buildSection(callerResults, limit, projectRoot);
  const callees = buildSection(calleeResults, limit, projectRoot);
  const imports = buildSection(importResults, limit, projectRoot);
  const unresolved = buildSection(unresolvedResults, limit, projectRoot);

  return formatNeighborhood(
    { name: node.name, kind: node.kind, anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved
  );
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 14: symbolGraph returns not found message for unknown symbol [depends: 13]

**Spec criteria:** 22

**Files:**
- Test: `test/tool-symbol-graph.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-symbol-graph.test.ts`:

```typescript
test("symbolGraph returns not found message for unknown symbol", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();

    const output = symbolGraph({ name: "doesNotExist", store, projectRoot });

    expect(output).toContain("not found");
    expect(output).toContain("doesNotExist");

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS — Task 13 implementation already handles zero matches. This test covers spec criterion 22.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 15: symbolGraph returns disambiguation list for ambiguous names [depends: 13]

**Spec criteria:** 23

**Files:**
- Test: `test/tool-symbol-graph.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-symbol-graph.test.ts`:

```typescript
test("symbolGraph returns disambiguation list when multiple nodes match", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    // Two nodes with same name "foo" in different files
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    const output = symbolGraph({ name: "foo", store, projectRoot });

    // Should be a disambiguation list, not a neighborhood
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
    expect(output).toContain("function");
    expect(output).toContain("class");

    // Should NOT contain section headers (not a neighborhood)
    expect(output).not.toContain("Callers");
    expect(output).not.toContain("Callees");

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS — Task 13 implementation already handles multiple matches. This test covers spec criterion 23.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 16: symbolGraph resolves ambiguity with file filter [depends: 13]

**Spec criteria:** 24

**Files:**
- Test: `test/tool-symbol-graph.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-symbol-graph.test.ts`:

```typescript
test("symbolGraph resolves ambiguity when file filter narrows to one match", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    // Two nodes with same name "foo" in different files
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "function", name: "foo", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    // With file filter, should return full neighborhood (not disambiguation)
    const output = symbolGraph({ name: "foo", file: "src/a.ts", store, projectRoot });

    // Should be a neighborhood, not disambiguation
    expect(output).toContain("foo (function)");
    expect(output).toContain("src/a.ts:3:");
    expect(output).not.toContain("Multiple matches");

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS — Task 13 implementation passes `file` to `findNodes`, which filters. This test covers spec criterion 24.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 17: symbolGraph truncates neighbor categories independently with limit [depends: 13]

**Spec criteria:** 26

**Files:**
- Test: `test/tool-symbol-graph.test.ts`

**Step 1 — Write the failing test**

Append to `test/tool-symbol-graph.test.ts`:

```typescript
test("symbolGraph truncates each neighbor category independently to limit", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const hashA = sha256Hex(fileAContent);

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });

    // Add 3 callees
    for (let i = 0; i < 3; i++) {
      const calleeId = `src/a.ts::callee${i}:${10 + i}`;
      store.addNode({ id: calleeId, kind: "function", name: `callee${i}`, file: "src/a.ts", start_line: 10 + i, end_line: 10 + i, content_hash: hashA });
      store.addEdge({
        source: "src/a.ts::foo:3",
        target: calleeId,
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5 - i * 0.1, evidence: "call", content_hash: hashA },
        created_at: Date.now(),
      });
    }

    // Limit to 2 — should see 2 callees and "(1 more omitted)"
    const output = symbolGraph({ name: "foo", limit: 2, store, projectRoot });

    expect(output).toContain("Callees");
    expect(output).toContain("callee0"); // highest confidence
    expect(output).toContain("callee1");
    expect(output).toContain("(1 more omitted)");
    expect(output).not.toContain("callee2"); // truncated

    store.close();
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS — Task 13 implementation already passes `limit` to `buildSection` for each category. This test covers spec criterion 26.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
