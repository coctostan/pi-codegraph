# Plan

### Task 1: Add shared result-scoped freshness evaluator

### Task 1: Add shared result-scoped freshness evaluator

**Covers:** AC 1, AC 3, AC 4, AC 5, AC 6, AC 7

**Files:**
- Create: `src/output/freshness.ts`
- Test: `test/output-freshness-evaluator.test.ts`

**Step 1 — Write the failing tests**
Create `test/output-freshness-evaluator.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphEdge, GraphNode } from "../src/graph/types.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { evaluateFreshness, formatFreshnessHeader } from "../src/output/freshness.js";

interface Fixture {
  projectRoot: string;
  store: SqliteGraphStore;
  target: GraphNode;
  neighbor: GraphNode;
  edge: GraphEdge;
  targetV1: string;
  neighborV1: string;
}

function createFixture(): Fixture {
  const projectRoot = join(tmpdir(), `pi-cg-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const targetV1 = "export function target() { return 1; }\n";
  const neighborV1 = "export function neighbor() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "target.ts"), targetV1);
  writeFileSync(join(projectRoot, "src", "neighbor.ts"), neighborV1);

  const targetHash = sha256Hex(targetV1);
  const neighborHash = sha256Hex(neighborV1);
  const store = new SqliteGraphStore();

  const target: GraphNode = {
    id: "src/target.ts::target:1",
    kind: "function",
    name: "target",
    file: "src/target.ts",
    start_line: 1,
    end_line: 1,
    content_hash: targetHash,
    is_exported: true,
  };
  const neighbor: GraphNode = {
    id: "src/neighbor.ts::neighbor:1",
    kind: "function",
    name: "neighbor",
    file: "src/neighbor.ts",
    start_line: 1,
    end_line: 1,
    content_hash: neighborHash,
    is_exported: true,
  };
  const edge: GraphEdge = {
    source: target.id,
    target: neighbor.id,
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.8,
      evidence: "target calls neighbor",
      content_hash: targetHash,
    },
    created_at: 1,
  };

  store.addNode(target);
  store.addNode(neighbor);
  store.addEdge(edge);
  store.setFileHash("src/target.ts", targetHash);
  store.setFileHash("src/neighbor.ts", neighborHash);

  return { projectRoot, store, target, neighbor, edge, targetV1, neighborV1 };
}

function cleanup(fixture: Fixture): void {
  fixture.store.close();
  rmSync(fixture.projectRoot, { recursive: true, force: true });
}

test("evaluateFreshness returns Trust: fresh for fresh scoped target nodes", () => {
  const fixture = createFixture();
  try {
    const fresh = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target],
      resultEdges: [],
    });
    expect(fresh.status).toBe("fresh");
    expect(formatFreshnessHeader(fresh)).toBe("Trust: fresh");
  } finally {
    cleanup(fixture);
  }
});

test("evaluateFreshness returns stale when the requested target node changed", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.projectRoot, "src", "target.ts"), "export function target() { return 2; }\n");
    const staleTarget = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target],
      resultEdges: [],
    });
    expect(staleTarget.status).toBe("stale");
    expect(staleTarget.changedFiles.map((f) => f.file)).toEqual(["src/target.ts"]);
    expect(staleTarget.affectedSymbols).toEqual(["target"]);
    expect(formatFreshnessHeader(staleTarget)).toContain("src/target.ts (indexed_at:");
  } finally {
    cleanup(fixture);
  }
});

test("evaluateFreshness returns partial when only a returned neighbor node changed", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.projectRoot, "src", "neighbor.ts"), "export function neighbor() { return 2; }\n");
    const staleNeighbor = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target, fixture.neighbor],
      resultEdges: [],
    });
    expect(staleNeighbor.status).toBe("partial");
    expect(staleNeighbor.changedFiles.map((f) => f.file)).toEqual(["src/neighbor.ts"]);
    expect(staleNeighbor.affectedSymbols).toEqual(["neighbor"]);
  } finally {
    cleanup(fixture);
  }
});

test("evaluateFreshness counts stale edge provenance against the source evidence file", () => {
  const fixture = createFixture();
  try {
    const staleEdge = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target, fixture.neighbor],
      resultEdges: [{ ...fixture.edge, provenance: { ...fixture.edge.provenance, content_hash: "old-hash" } }],
    });
    expect(staleEdge.status).toBe("partial");
    expect(staleEdge.changedFiles.map((f) => f.file)).toEqual(["src/target.ts"]);
    expect(staleEdge.affectedSymbols).toEqual(["neighbor", "target"]);
    expect(staleEdge.staleEdgeCount).toBe(1);
    expect(formatFreshnessHeader(staleEdge)).toContain("stale edges: 1");
  } finally {
    cleanup(fixture);
  }
});

test("evaluateFreshness reports deleted returned files deterministically", () => {
  const fixture = createFixture();
  try {
    unlinkSync(join(fixture.projectRoot, "src", "neighbor.ts"));
    const deleted = evaluateFreshness({
      store: fixture.store,
      projectRoot: fixture.projectRoot,
      targetNodes: [fixture.target],
      resultNodes: [fixture.target, fixture.neighbor],
      resultEdges: [],
    });
    expect(deleted.status).toBe("partial");
    expect(deleted.deletedFiles.map((f) => f.file)).toEqual(["src/neighbor.ts"]);
    expect(deleted.affectedSymbols).toEqual(["neighbor"]);
    const header = formatFreshnessHeader(deleted);
    expect(header).toContain("deleted files: src/neighbor.ts (indexed_at:");
    expect(header).not.toMatch(/ago|today|yesterday|just now/i);
  } finally {
    cleanup(fixture);
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-freshness-evaluator.test.ts`
Expected: FAIL — `Cannot find module '../src/output/freshness.js'`

**Step 3 — Write minimal implementation**
Create `src/output/freshness.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { GraphStore } from "../graph/store.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { sha256Hex } from "../indexer/tree-sitter.js";

export type FreshnessStatus = "fresh" | "partial" | "stale" | "unknown";

export interface FreshnessFileDetail {
  file: string;
  indexedAt?: number;
}

export interface FreshnessReport {
  status: FreshnessStatus;
  changedFiles: FreshnessFileDetail[];
  deletedFiles: FreshnessFileDetail[];
  affectedSymbols: string[];
  staleEdgeCount: number;
  message: string;
  recommendation?: string;
}

export interface FreshnessEvaluationParams {
  store: GraphStore;
  projectRoot: string;
  targetNodes?: GraphNode[];
  resultNodes?: GraphNode[];
  resultEdges?: GraphEdge[];
  unresolvedItems?: string[];
  recommendation?: string;
}

interface MutableReport {
  changedFiles: Map<string, FreshnessFileDetail>;
  deletedFiles: Map<string, FreshnessFileDetail>;
  affectedSymbols: Set<string>;
  staleEdgeCount: number;
  targetStale: boolean;
  localStale: boolean;
  unknown: boolean;
}

function indexedAt(store: GraphStore, file: string): number | undefined {
  try {
    const rows = store.queryRows<{ indexed_at: number }>("SELECT indexed_at FROM file_hashes WHERE file = ?", [file]);
    return rows[0]?.indexed_at;
  } catch {
    return undefined;
  }
}

function fileDetail(store: GraphStore, file: string): FreshnessFileDetail {
  const at = indexedAt(store, file);
  return at === undefined ? { file } : { file, indexedAt: at };
}

function sortedFiles(files: Map<string, FreshnessFileDetail>): FreshnessFileDetail[] {
  return [...files.values()].sort((a, b) => a.file.localeCompare(b.file));
}

function sortedStrings(values: Set<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function inspectNode(node: GraphNode, params: FreshnessEvaluationParams, report: MutableReport, isTarget: boolean): void {
  const fullPath = join(params.projectRoot, node.file);
  if (!existsSync(fullPath)) {
    report.deletedFiles.set(node.file, fileDetail(params.store, node.file));
    report.affectedSymbols.add(node.name);
    report.localStale = true;
    if (isTarget) report.targetStale = true;
    return;
  }

  const currentHash = sha256Hex(readFileSync(fullPath, "utf8"));
  if (currentHash !== node.content_hash) {
    report.changedFiles.set(node.file, fileDetail(params.store, node.file));
    report.affectedSymbols.add(node.name);
    report.localStale = true;
    if (isTarget) report.targetStale = true;
  }
}

function inspectEdge(edge: GraphEdge, params: FreshnessEvaluationParams, report: MutableReport): void {
  const sourceNode = params.store.getNode(edge.source);
  if (!sourceNode) {
    report.staleEdgeCount++;
    report.localStale = true;
    report.unknown = true;
    return;
  }

  const fullPath = join(params.projectRoot, sourceNode.file);
  if (!existsSync(fullPath)) {
    report.staleEdgeCount++;
    report.deletedFiles.set(sourceNode.file, fileDetail(params.store, sourceNode.file));
    report.affectedSymbols.add(sourceNode.name);
    report.localStale = true;
    return;
  }

  const currentHash = sha256Hex(readFileSync(fullPath, "utf8"));
  if (currentHash !== edge.provenance.content_hash) {
    report.staleEdgeCount++;
    report.changedFiles.set(sourceNode.file, fileDetail(params.store, sourceNode.file));
    report.affectedSymbols.add(sourceNode.name);
    const targetNode = params.store.getNode(edge.target);
    if (targetNode) report.affectedSymbols.add(targetNode.name);
    report.localStale = true;
  }
}

export function evaluateFreshness(params: FreshnessEvaluationParams): FreshnessReport {
  const report: MutableReport = {
    changedFiles: new Map(),
    deletedFiles: new Map(),
    affectedSymbols: new Set(),
    staleEdgeCount: 0,
    targetStale: false,
    localStale: false,
    unknown: false,
  };

  const targetIds = new Set((params.targetNodes ?? []).map((node) => node.id));
  const nodesById = new Map<string, GraphNode>();
  for (const node of [...(params.targetNodes ?? []), ...(params.resultNodes ?? [])]) {
    nodesById.set(node.id, node);
  }

  for (const node of nodesById.values()) inspectNode(node, params, report, targetIds.has(node.id));
  for (const edge of params.resultEdges ?? []) inspectEdge(edge, params, report);
  if ((params.unresolvedItems ?? []).length > 0) {
    report.unknown = true;
    report.localStale = true;
  }

  const status: FreshnessStatus = report.unknown
    ? "unknown"
    : report.targetStale
      ? "stale"
      : report.localStale
        ? "partial"
        : "fresh";
  const changedFiles = sortedFiles(report.changedFiles);
  const deletedFiles = sortedFiles(report.deletedFiles);
  const affectedSymbols = sortedStrings(report.affectedSymbols);
  const message = status === "fresh" ? "result is fresh" : `${status} result freshness`;

  return {
    status,
    changedFiles,
    deletedFiles,
    affectedSymbols,
    staleEdgeCount: report.staleEdgeCount,
    message,
    recommendation: params.recommendation,
  };
}

function formatFiles(label: string, files: FreshnessFileDetail[]): string | null {
  if (files.length === 0) return null;
  const rendered = files
    .map((item) => item.indexedAt === undefined ? item.file : `${item.file} (indexed_at: ${item.indexedAt})`)
    .join(", ");
  return `- ${label}: ${rendered}`;
}

export function formatFreshnessHeader(report: FreshnessReport): string {
  if (report.status === "fresh") return "Trust: fresh";
  const lines = [`Trust: ${report.status}`];
  const changed = formatFiles("changed files", report.changedFiles);
  const deleted = formatFiles("deleted files", report.deletedFiles);
  if (changed) lines.push(changed);
  if (deleted) lines.push(deleted);
  if (report.affectedSymbols.length > 0) lines.push(`- affected symbols: ${report.affectedSymbols.join(", ")}`);
  if (report.staleEdgeCount > 0) lines.push(`- stale edges: ${report.staleEdgeCount}`);
  lines.push(`- recommendation: ${report.recommendation ?? "refresh index before relying on this result"}`);
  return lines.join("\n");
}

export function prependFreshnessHeader(body: string, report: FreshnessReport): string {
  return `${formatFreshnessHeader(report)}\n${body}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-freshness-evaluator.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: Strip compact freshness headers [depends: 1]

### Task 2: Strip compact freshness headers [depends: 1]

**Covers:** AC 2, AC 12

**Files:**
- Modify: `src/output/read-only-ceremony.ts`
- Test: `test/output-compact-freshness-ceremony.test.ts`

**Step 1 — Write the failing tests**
Create `test/output-compact-freshness-ceremony.test.ts`:

```ts
import { expect, test } from "bun:test";

import { stripTrustHeader, suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";

test("suppressFreshTrustHeader leaves compact freshness headers untouched", () => {
  expect(suppressFreshTrustHeader("Trust: fresh\nbody\n")).toBe("Trust: fresh\nbody\n");
  expect(suppressFreshTrustHeader("Trust: partial\n- changed files: src/a.ts\nbody\n")).toBe(
    "Trust: partial\n- changed files: src/a.ts\nbody\n",
  );
});

test("stripTrustHeader removes compact freshness headers", () => {
  expect(stripTrustHeader("Trust: fresh\nbody\n")).toBe("body\n");
  expect(
    stripTrustHeader(
      "Trust: unknown\n- deleted files: src/a.ts\n- recommendation: refresh index before relying on this result\nbody\n",
    ),
  ).toBe("body\n");
});

test("stripTrustHeader still removes legacy trust blocks", () => {
  const legacy = ["## Trust", "status: stale", "evidence: tree-sitter  stale-files: 1/2", "body", ""].join("\n");
  expect(stripTrustHeader(legacy)).toBe("body\n");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-compact-freshness-ceremony.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` for `stripTrustHeader("Trust: fresh\\nbody\\n")`: Expected: `"body\\n"`; Received: `"Trust: fresh\\nbody\\n"`

**Step 3 — Write minimal implementation**
Replace `src/output/read-only-ceremony.ts` with this complete implementation. This intentionally keeps `suppressFreshTrustHeader` legacy-only so unsuppressed compact fresh output still starts with `Trust: fresh`:

```ts
function stripCompactTrustHeader(lines: string[]): string | null {
  if (!lines[0]?.startsWith("Trust: ")) return null;
  let bodyStart = 1;
  while (bodyStart < lines.length && (lines[bodyStart] ?? "").startsWith("- ")) {
    bodyStart++;
  }
  return lines.slice(bodyStart).join("\n");
}

export function suppressFreshTrustHeader(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (lines[1] !== "status: fresh") return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}

export function stripTrustHeader(text: string): string {
  const lines = text.split("\n");
  const compact = stripCompactTrustHeader(lines);
  if (compact !== null) return compact;
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (!(lines[1] ?? "").startsWith("status: ")) return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-compact-freshness-ceremony.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Report symbol graph freshness [depends: 1, 2]

### Task 3: Report symbol graph freshness [depends: 1, 2]

**Covers:** AC 2, AC 3, AC 8, AC 11, AC 13, AC 14

**Files:**
- Modify: `src/tools/symbol-graph.ts`
- Modify existing tests: `test/tool-symbol-graph-trust-header.test.ts`, `test/tool-symbol-graph-contract-include.test.ts`, `test/extension-readonly-trust-gating.test.ts`, `test/extension-suppress-trust-header-symbol-graph.test.ts`, `test/extension-suppress-trust-header-interactions.test.ts`
- Test: `test/tool-symbol-graph-freshness-report.test.ts`

**Step 1 — Write the failing tests**
Create `test/tool-symbol-graph-freshness-report.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function setupFooBar(): {
  projectRoot: string;
  store: SqliteGraphStore;
  cleanup: () => void;
} {
  const projectRoot = join(tmpdir(), `pi-cg-symbol-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fooV1 = "export function foo() { return bar(); }\n";
  const barV1 = "export function bar() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "foo.ts"), fooV1);
  writeFileSync(join(projectRoot, "src", "bar.ts"), barV1);
  const fooHash = sha256Hex(fooV1);
  const barHash = sha256Hex(barV1);
  const store = new SqliteGraphStore();
  store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 1, content_hash: fooHash, is_exported: true });
  store.addNode({ id: "src/bar.ts::bar:1", kind: "function", name: "bar", file: "src/bar.ts", start_line: 1, end_line: 1, content_hash: barHash, is_exported: true });
  store.addEdge({ source: "src/foo.ts::foo:1", target: "src/bar.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.8, evidence: "foo calls bar", content_hash: fooHash }, created_at: 1 });
  store.setFileHash("src/foo.ts", fooHash);
  store.setFileHash("src/bar.ts", barHash);
  return {
    projectRoot,
    store,
    cleanup: () => {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("symbolGraph reports partial freshness for stale returned neighborhood evidence", () => {
  const { projectRoot, store, cleanup } = setupFooBar();
  try {
    const fresh = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
    expect(fresh.split("\n")[0]).toBe("Trust: fresh");

    writeFileSync(join(projectRoot, "src", "bar.ts"), "export function bar() { return 2; }\n");
    const partial = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
    expect(partial).toContain("Trust: partial");
    expect(partial).toContain("changed files: src/bar.ts");
    expect(partial).toContain("affected symbols: bar");
    expect(partial).toContain("bar  calls  confidence:0.8  tree-sitter [stale]");
  } finally {
    cleanup();
  }
});

test("symbolGraph reports stale freshness when the target symbol file changed", () => {
  const { projectRoot, store, cleanup } = setupFooBar();
  try {
    writeFileSync(join(projectRoot, "src", "foo.ts"), "export function foo() { return bar() + 1; }\n");
    const stale = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
    expect(stale).toContain("Trust: stale");
    expect(stale).toContain("changed files: src/foo.ts");
    expect(stale).toContain("affected symbols: bar, foo");
  } finally {
    cleanup();
  }
});

test("symbolGraph freshness ignores stale neighbors omitted by the rendered limit", () => {
  const projectRoot = join(tmpdir(), `pi-cg-symbol-limit-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const root = "export function root() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "root.ts"), root);
  const rootHash = sha256Hex(root);
  const store = new SqliteGraphStore();

  try {
    store.addNode({ id: "src/root.ts::root:1", kind: "function", name: "root", file: "src/root.ts", start_line: 1, end_line: 1, content_hash: rootHash, is_exported: true });
    store.setFileHash("src/root.ts", rootHash);

    for (let i = 0; i < 3; i++) {
      const file = `src/dep${i}.ts`;
      const name = `dep${i}`;
      const content = `export function ${name}() { return ${i}; }\n`;
      writeFileSync(join(projectRoot, file), content);
      const hash = sha256Hex(content);
      const id = `${file}::${name}:1`;
      store.addNode({ id, kind: "function", name, file, start_line: 1, end_line: 1, content_hash: hash, is_exported: true });
      store.addEdge({ source: "src/root.ts::root:1", target: id, kind: "calls", provenance: { source: "tree-sitter", confidence: i === 2 ? 0.1 : 0.9, evidence: `${name}:1`, content_hash: rootHash }, created_at: i + 1 });
      store.setFileHash(file, hash);
    }

    writeFileSync(join(projectRoot, "src", "dep2.ts"), "export function dep2() { return 99; }\n");
    const output = symbolGraph({ name: "root", include: ["neighborhood"], limit: 2, store, projectRoot });
    expect(output.split("\n")[0]).toBe("Trust: fresh");
    expect(output).toContain("dep0");
    expect(output).toContain("dep1");
    expect(output).not.toContain("dep2");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update the existing symbol graph trust-header tests in the same RED step so the full suite expects the new compact format:

- In `test/tool-symbol-graph-trust-header.test.ts`, replace the whole legacy header assertion block with:
  ```ts
  expect(freshLines[0]).toBe("Trust: fresh");
  expect(freshOutput).toContain("## foo (function)");
  expect(freshOutput).not.toContain("bar  calls  confidence:0.7  agent [stale]");

  expect(mixedLines[0]).toBe("Trust: partial");
  expect(mixedOutput).toContain("changed files: src/a.ts");
  expect(mixedOutput).toContain("stale edges: 1");
  expect(mixedOutput).toContain("bar  calls  confidence:0.7  agent [stale]");
  ```
- In `test/tool-symbol-graph-contract-include.test.ts`, replace both occurrences of `expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);` with:
  ```ts
  expect((withContract.match(/^Trust: /gm) ?? []).length).toBe(1);
  ```
- In `test/extension-readonly-trust-gating.test.ts`, change the fresh `symbol_graph` assertion from “no Trust header” to:
  ```ts
  expect(text.startsWith("Trust: fresh\n## foo (function)")).toBe(true);
  ```
- In `test/extension-suppress-trust-header-symbol-graph.test.ts`, replace stale-baseline and suppressed-header assertions with:
  ```ts
  expect(baselineText).toContain("Trust: stale");
  expect(suppressedText.includes("## Trust")).toBe(false);
  expect(suppressedText.includes("Trust: ")).toBe(false);
  expect(suppressedText).toContain("## foo (function)");
  ```
- In `test/extension-suppress-trust-header-interactions.test.ts`, update the symbol_graph-specific assertions:
  ```ts
  expect(text.includes("## Trust")).toBe(false);
  expect(text.includes("Trust: ")).toBe(false);
  expect(text).toMatch(/indexing-failed \(\d+s ago\): readonly database/);

  expect(baselineText.startsWith("Trust: fresh\n## foo (function)")).toBe(true);

  const trustIndex = baselineLines.findIndex((line) => line.startsWith("Trust: "));
  expect(trustIndex).toBeGreaterThanOrEqual(0);
  let bodyStart = trustIndex + 1;
  while ((baselineLines[bodyStart] ?? "").startsWith("- ")) bodyStart++;
  const withoutTrust = [
    ...baselineLines.slice(0, trustIndex),
    ...baselineLines.slice(bodyStart),
  ].join("\n");

  expect(suppressedText.includes("## Trust")).toBe(false);
  expect(suppressedText.includes("Trust: ")).toBe(false);
  expect(suppressedText).toBe(withoutTrust);
  ```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-freshness-report.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` for `fresh.split("\n")[0]`: Expected: `"Trust: fresh"`; Received: `"## Trust"`

**Step 3 — Write minimal implementation**
Apply these exact edits to `src/tools/symbol-graph.ts`.

1. Replace the existing import block at the top so the trust import is removed and the freshness/types imports are present:

```ts
import type { GraphStore, NeighborResult } from "../graph/store.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  type AnchoredNeighbor,
  type NeighborSection,
  type NamedSection,
} from "../output/anchoring.js";
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
import { createSignalComputer, type NodeSignals } from "../output/signals.js";
import { renderSymbolCardBody, renderSymbolSourceSection } from "./symbol-card.js";
import { renderSymbolContractBody } from "./symbol-contract.js";
```

2. Add these helpers immediately above `export function symbolGraph(...)`. They intentionally mirror `renderLegacyNeighborhoodBody(...)` and `renderSymbolCardBody(...)` so freshness is computed only from rows actually returned to the agent:

```ts
function collectVisibleNeighborhoodScope(params: SymbolGraphParams, node: GraphNode): {
  resultNodes: GraphNode[];
  resultEdges: GraphEdge[];
} {
  const limit = params.limit ?? 10;
  const buckets = new Map<string, NeighborResult[]>();
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of params.store.getNeighbors(node.id)) {
    if (nr.node.file.startsWith("__meta__")) continue;
    if (nr.node.file.startsWith("__unresolved__")) {
      unresolvedResults.push(nr);
      continue;
    }
    const direction = nr.edge.target === node.id ? "in" : "out";
    const title = sectionTitle(nr.edge.kind, direction);
    const bucket = buckets.get(title) ?? [];
    bucket.push(nr);
    buckets.set(title, bucket);
  }

  const sectionOrder = [
    "Callers", "Callees", "Imports", "Imported By",
    "Implemented By", "Implements",
    "Extended By", "Extends",
    "Tested By", "Tests",
    "Co-changes With",
    "Rendered By", "Renders",
    "Routed From", "Routes To",
  ];
  const visible: NeighborResult[] = [];
  for (const title of sectionOrder) {
    const bucket = buckets.get(title);
    if (bucket && bucket.length > 0) {
      visible.push(...rankNeighbors(bucket, limit).kept);
      buckets.delete(title);
    }
  }
  for (const bucket of buckets.values()) visible.push(...rankNeighbors(bucket, limit).kept);
  visible.push(...rankNeighbors(unresolvedResults, limit).kept);

  return {
    resultNodes: visible
      .filter((nr) => !nr.node.file.startsWith("__unresolved__"))
      .map((nr) => nr.node),
    resultEdges: visible.map((nr) => nr.edge),
  };
}

function collectDefaultCardScope(params: SymbolGraphParams, node: GraphNode): {
  resultNodes: GraphNode[];
  resultEdges: GraphEdge[];
} {
  const allNeighbors = params.store.getNeighbors(node.id).filter(
    (nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"),
  );
  const tests = allNeighbors.filter((nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id);
  const callers = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.target === node.id).slice(0, 5);
  const callees = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.source === node.id).slice(0, 5);
  const imports = allNeighbors.filter((nr) => nr.edge.kind === "imports" && nr.edge.source === node.id).slice(0, 5);
  const extendsOut = allNeighbors.filter((nr) => nr.edge.kind === "extends" && nr.edge.source === node.id).slice(0, 5);
  const implementsOut = allNeighbors.filter((nr) => nr.edge.kind === "implements" && nr.edge.source === node.id).slice(0, 5);
  const visible = [...tests, ...callers, ...callees, ...imports, ...extendsOut, ...implementsOut];
  return {
    resultNodes: visible.map((nr) => nr.node),
    resultEdges: visible.map((nr) => nr.edge),
  };
}

function collectSymbolGraphScope(params: SymbolGraphParams): {
  targetNodes: GraphNode[];
  resultNodes: GraphNode[];
  resultEdges: GraphEdge[];
} {
  const resolvedNodes = params.store.findNodes(params.name, params.file);
  const targetNodes = resolvedNodes.length === 1 ? [resolvedNodes[0]!] : [];
  const resultNodes = new Map<string, GraphNode>();
  const resultEdges: GraphEdge[] = [];

  for (const node of resolvedNodes) resultNodes.set(node.id, node);
  if (resolvedNodes.length === 1) {
    const node = resolvedNodes[0]!;
    const scoped = (params.include ?? []).includes("neighborhood")
      ? collectVisibleNeighborhoodScope(params, node)
      : collectDefaultCardScope(params, node);
    for (const resultNode of scoped.resultNodes) resultNodes.set(resultNode.id, resultNode);
    resultEdges.push(...scoped.resultEdges);
  }

  return { targetNodes, resultNodes: [...resultNodes.values()], resultEdges };
}
```

3. Replace the entire `symbolGraph` function with this complete implementation:

```ts
export function symbolGraph(params: SymbolGraphParams): string {
  const { include } = params;
  const resolvedNodes = params.store.findNodes(params.name, params.file);
  const useNeighborhoodBase = (include ?? []).includes("neighborhood");
  const base = useNeighborhoodBase
    ? renderLegacyNeighborhoodBody(params)
    : renderSymbolCardBody({
        name: params.name,
        file: params.file,
        store: params.store,
        projectRoot: params.projectRoot,
      });
  let body = base.body;
  if (resolvedNodes.length === 1 && (include ?? []).includes("contract")) {
    const renderedContract = renderSymbolContractBody({
      name: params.name,
      file: params.file,
      store: params.store,
      projectRoot: params.projectRoot,
    });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${renderedContract.body}`;
  }

  if (resolvedNodes.length === 1 && (include ?? []).includes("source")) {
    const renderedSource = renderSymbolSourceSection({
      name: params.name,
      file: params.file,
      store: params.store,
      projectRoot: params.projectRoot,
    });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${renderedSource.body}`;
  }

  const freshness = evaluateFreshness({
    store: params.store,
    projectRoot: params.projectRoot,
    ...collectSymbolGraphScope(params),
  });
  return prependFreshnessHeader(body, freshness);
}
```

This removes the old `const stats = params.store.getStatistics(params.projectRoot);` and the old final `prependTrustHeader(...)` call. Existing body renderers and `toAnchoredNeighbor(...)` continue to emit row-level `[stale]` markers.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-freshness-report.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Warn on stale impact results [depends: 1, 2]

### Task 4: Warn on stale impact results [depends: 1, 2]

**Covers:** AC 2, AC 3, AC 9, AC 11, AC 13, AC 14

**Files:**
- Modify: `src/tools/impact.ts`
- Modify existing tests: `test/tool-impact-trust-header.test.ts`, `test/tool-impact-empty-symbols.test.ts`, `test/tool-impact-empty-output.test.ts`, `test/tool-impact-empty-diagnostic.test.ts`, `test/tool-impact-083-repro.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-performance.test.ts`, `test/extension-impact.test.ts`, `test/extension-suppress-trust-header-impact.test.ts`
- Test: `test/tool-impact-freshness-warning.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-impact-freshness-warning.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { impact } from "../src/tools/impact.js";

test("impact reports stale dependency freshness warning for incomplete blast radius", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const shared = "export function shared() { return 1; }\n";
  const callerV1 = "import { shared } from './shared';\nexport function caller() { return shared(); }\n";
  const callerV2 = "import { shared } from './shared';\nexport function caller() { return shared() + 1; }\n";
  writeFileSync(join(projectRoot, "src", "shared.ts"), shared);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerV1);
  const sharedHash = sha256Hex(shared);
  const callerHash = sha256Hex(callerV1);
  const store = new SqliteGraphStore();

  try {
    store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: sharedHash, is_exported: true });
    store.addNode({ id: "src/caller.ts::caller:2", kind: "function", name: "caller", file: "src/caller.ts", start_line: 2, end_line: 2, content_hash: callerHash, is_exported: true });
    store.addEdge({ source: "src/caller.ts::caller:2", target: "src/shared.ts::shared:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.8, evidence: "shared:2:35", content_hash: callerHash }, created_at: 1 });
    store.setFileHash("src/shared.ts", sharedHash);
    store.setFileHash("src/caller.ts", callerHash);

    const fresh = impact({ symbols: ["shared"], changeType: "signature_change", store, projectRoot });
    expect(fresh.split("\n")[0]).toBe("Trust: fresh");

    writeFileSync(join(projectRoot, "src", "caller.ts"), callerV2);
    const stale = impact({ symbols: ["shared"], changeType: "signature_change", store, projectRoot });
    expect(stale).toContain("Trust: partial");
    expect(stale).toContain("changed files: src/caller.ts");
    expect(stale).toContain("affected symbols: caller, shared");
    expect(stale).toContain("stale edges: 1");
    expect(stale).toContain("impact may be incomplete; refresh index before relying on this result");
    expect(stale).toContain("caller  breaking  depth:1 [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update existing impact tests in the same RED step so `bun test` expects compact freshness headers:

- In `test/tool-impact-trust-header.test.ts`, replace the legacy header assertions with:
  ```ts
  expect(freshLines[0]).toBe("Trust: fresh");
  expect(freshOutput).not.toContain("depth:1 [stale]");

  expect(staleLines[0]).toBe("Trust: partial");
  expect(staleOutput).toContain("changed files: src/caller.ts");
  expect(staleOutput).toContain("stale edges: 1");
  expect(staleOutput).toContain("impact may be incomplete; refresh index before relying on this result");
  expect(staleOutput).toContain("depth:1 [stale]");
  ```
- In `test/tool-impact-empty-symbols.test.ts`, replace each of the three `expect(out).toContain("## Trust")` lines with:
  ```ts
  expect(out).toContain("Trust: fresh");
  ```
- In `test/tool-impact-empty-output.test.ts`, replace both `expect(out).toContain("## Trust")` lines with:
  ```ts
  expect(out).toContain("Trust: fresh");
  ```
  In the addition-analysis test in that same file, also replace the legacy body filter:
  ```ts
  const bodyAfterTrust = out.split("\n").filter(line => !line.startsWith("##") && line.trim() !== "");
  const hasNonHeaderContent = bodyAfterTrust.some(line =>
    !line.startsWith("status:") && !line.startsWith("evidence:")
  );
  ```
  with compact-header filtering:
  ```ts
  const bodyAfterTrust = out.split("\n").filter(line => !line.startsWith("Trust:") && !line.startsWith("- ") && line.trim() !== "");
  const hasNonHeaderContent = bodyAfterTrust.length > 0;
  ```
- In `test/tool-impact-empty-diagnostic.test.ts`, replace the three `expect(out).toContain("## Trust")` lines with `expect(out).toContain("Trust: partial")` because those tests intentionally seed nodes with fake `content_hash: "h"` against real files.
- In `test/tool-impact-083-repro.test.ts`, replace both `expect(out).toContain("## Trust")` lines with `expect(out).toContain("Trust: partial")` for the same fake-hash reason.
- In `test/tool-impact-output-signals.test.ts`, replace `expect(out).toContain("## Trust")` with:
  ```ts
  expect(out).toContain("Trust: fresh");
  ```
- In `test/tool-impact-performance.test.ts`, replace `expect(output).toContain("## Trust")` with:
  ```ts
  expect(output).toContain("Trust: fresh");
  ```
- In `test/extension-impact.test.ts`, replace the two legacy assertions with:
  ```ts
  expect(out).toContain("Trust: fresh");
  expect(noImpact).toContain("Trust: fresh");
  ```
- In `test/extension-suppress-trust-header-impact.test.ts`, replace the stale-baseline and suppressed-header assertions with:
  ```ts
  expect(baselineText).toContain("Trust: stale");
  expect(suppressedText.includes("## Trust")).toBe(false);
  expect(suppressedText.includes("Trust: ")).toBe(false);
  expect(suppressedText).toContain("caller");
  ```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-impact-freshness-warning.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` for `fresh.split("\n")[0]`: Expected: `"Trust: fresh"`; Received: `"## Trust"`

**Step 3 — Write minimal implementation**
Apply these exact edits to `src/tools/impact.ts`.

1. Replace the trust import:

```ts
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
```

2. Extend `ImpactDetail` with the edge that discovered the dependent:

```ts
export interface ImpactDetail extends ImpactItem {
  chainConfidence: number;
  signals: NodeSignals;
  edge: NeighborResult["edge"];
}
```

3. In `collectImpactDetails`, add the exact `edge` field to the object passed to `detailsByNode.set(...)`:

```ts
      detailsByNode.set(neighbor.node.id, {
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
        chainConfidence,
        signals: signalComputer.compute(neighbor.node.id, changedNodeIds),
        edge: neighbor.edge,
      });
```

4. Replace the entire existing `impact(...)` function with this complete implementation. It declares `targetNodes` and `withFreshness` before any early returns, and every return path uses the freshness wrapper:

```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  const targetNodes = (params.symbols ?? []).flatMap((symbol) => params.store.findNodes(symbol));
  const withFreshness = (
    body: string,
    resultNodes = targetNodes,
    resultEdges: NeighborResult["edge"][] = [],
  ) => prependFreshnessHeader(
    body,
    evaluateFreshness({
      store: params.store,
      projectRoot: params.projectRoot,
      targetNodes,
      resultNodes,
      resultEdges,
      recommendation: "impact may be incomplete; refresh index before relying on this result",
    }),
  );

  // Defensive: validate symbols parameter (#065)
  if (!params.symbols || params.symbols.length === 0) {
    return withFreshness(
      "Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n",
    );
  }

  // Defensive: validate changeType (#065)
  const validChangeTypes: ChangeType[] = ["signature_change", "removal", "behavior_change", "addition"];
  if (!validChangeTypes.includes(params.changeType)) {
    return withFreshness(
      `Error: Invalid changeType "${params.changeType}". Must be one of: ${validChangeTypes.join(", ")}\n`,
    );
  }

  for (const symbol of params.symbols) {
    const resolved = resolveUniqueSymbol({
      name: symbol,
      store: params.store,
      projectRoot: params.projectRoot,
      notFoundLabel: "Symbol",
    });
    if (resolved.kind === "ambiguous") return withFreshness(resolved.text);
    if (resolved.kind === "not_found") return withFreshness(resolved.text);
  }

  if (params.changeType === "addition") {
    return withFreshness(
      `addition: impact analysis for additions is not yet supported — use symbol_graph to inspect the new symbol's neighborhood\n`,
    );
  }

  const signalComputer = createSignalComputer(params.store);
  const hits = collectImpactDetails({
    symbols: params.symbols,
    changeType: params.changeType,
    store: params.store,
    maxDepth: params.maxDepth,
    signalComputer,
  });

  if (hits.length === 0) {
    const body = buildEmptyImpactDiagnostic(params.symbols, params.store, signalComputer, params.maxDepth ?? 5);
    return withFreshness(body);
  }

  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    const why = formatImpactWhy(hit.signals, hit.chainConfidence);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}  ${why}`];
  });

  const hitNodes = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    return node ? [node] : [];
  });
  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  return withFreshness(body, [...targetNodes, ...hitNodes], hits.map((hit) => hit.edge));
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-impact-freshness-warning.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Warn on unreliable coverage trace freshness [depends: 1, 2]

### Task 5: Warn on unreliable coverage trace freshness [depends: 1, 2]

**Covers:** AC 2, AC 3, AC 10, AC 11, AC 13, AC 14

**Files:**
- Modify: `src/tools/trace.ts`
- Modify existing tests: `test/tool-trace-trust-heuristic.test.ts`, `test/tool-trace-trust-runtime.test.ts`, `test/tool-trace-static-mode-header.test.ts`, `test/tool-trace-signals.test.ts`, `test/extension-suppress-trust-header-trace.test.ts`, `test/extension-suppress-trust-header-interactions.test.ts`, `test/extension-readonly-trust-gating.test.ts`
- Test: `test/tool-trace-freshness-warning.test.ts`

**Step 1 — Write the failing tests**
Create `test/tool-trace-freshness-warning.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

function createCoverageFixture(includeUnresolved = false): {
  projectRoot: string;
  store: SqliteGraphStore;
  prod: GraphNode;
  testNode: GraphNode;
  prodV1: string;
  testV1: string;
} {
  const projectRoot = join(tmpdir(), `pi-cg-trace-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const prodV1 = "export function prod() { return 1; }\n";
  const testV1 = "export function prodTest() { return prod(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), prodV1);
  writeFileSync(join(projectRoot, "src", "app.test.ts"), testV1);
  const prodHash = sha256Hex(prodV1);
  const testHash = sha256Hex(testV1);
  const store = new SqliteGraphStore();
  const prod: GraphNode = { id: "src/app.ts::prod:1", kind: "function", name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: prodHash };
  const testNode: GraphNode = { id: "src/app.test.ts::prodTest:1", kind: "test", name: "prodTest", file: "src/app.test.ts", start_line: 1, end_line: 1, content_hash: testHash };

  store.addNode(prod);
  store.addNode(testNode);
  store.addEdge({ source: prod.id, target: testNode.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "prod", content_hash: prodHash }, created_at: 1 });
  store.setFileHash("src/app.ts", prodHash);
  store.setFileHash("src/app.test.ts", testHash);
  store.saveTestTrace({
    testNodeId: testNode.id,
    steps: [
      { nodeId: testNode.id, ordinal: 0, contentHash: testHash },
      { nodeId: prod.id, ordinal: 1, contentHash: prodHash },
      ...(includeUnresolved ? [{ nodeId: "src/app.ts::removed:9", ordinal: 2, contentHash: "old-removed-hash" }] : []),
    ],
  });
  return { projectRoot, store, prod, testNode, prodV1, testV1 };
}

test("trace reports unknown freshness for unresolved stored coverage steps", () => {
  const fixture = createCoverageFixture(true);
  try {
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store: fixture.store, projectRoot: fixture.projectRoot });
    expect(output).toContain("Trust: unknown");
    expect(output).toContain("trace path may be unreliable; refresh index before relying on this result");
    expect(output).toContain("src/app.ts::removed:9  unresolved [stale]");
  } finally {
    fixture.store.close();
    rmSync(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("trace reports changed files and row-level stale markers for stale stored trace steps", () => {
  const fixture = createCoverageFixture(false);
  try {
    writeFileSync(join(fixture.projectRoot, "src", "app.ts"), "export function prod() { return 2; }\n");
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store: fixture.store, projectRoot: fixture.projectRoot });
    expect(output).toContain("Trust: partial");
    expect(output).toContain("changed files: src/app.ts");
    expect(output).toContain("affected symbols: prod");
    expect(output).toContain("mode: coverage [stale]");
    expect(output).toContain("prod  function [stale]");
  } finally {
    fixture.store.close();
    rmSync(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("trace reports deleted files for stored trace steps whose files were removed", () => {
  const fixture = createCoverageFixture(false);
  try {
    unlinkSync(join(fixture.projectRoot, "src", "app.ts"));
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store: fixture.store, projectRoot: fixture.projectRoot });
    expect(output).toContain("Trust: partial");
    expect(output).toContain("deleted files: src/app.ts");
    expect(output).toContain("mode: coverage [stale]");
  } finally {
    fixture.store.close();
    rmSync(fixture.projectRoot, { recursive: true, force: true });
  }
});
```

Update existing trace tests in the same RED step so the full suite expects compact freshness headers:

- In `test/tool-trace-trust-heuristic.test.ts`, replace the whole legacy header/index assertion block with:
  ```ts
  expect(lines[0]).toBe("Trust: fresh");
  expect(lines[1]).toBe("mode: static (heuristic, no runtime evidence)");
  expect(lines[2]).toContain("src/app.ts:1:");
  expect(lines[2]).toContain("entry  function");
  ```
- In `test/tool-trace-static-mode-header.test.ts`, replace the whole legacy header/index assertion block with:
  ```ts
  expect(lines[0]).toBe("Trust: fresh");
  expect(lines[1]).toBe("mode: static (heuristic, no runtime evidence)");
  expect(lines[2]).toContain("src/app.ts:1:");
  expect(lines[2]).toContain("entry  function");
  expect(lines).toHaveLength(5);
  ```
- In `test/tool-trace-trust-runtime.test.ts`, replace the full fresh and mixed legacy header assertion blocks with:
  ```ts
  expect(freshLines[0]).toBe("Trust: fresh");
  expect(freshLines[1]).toBe("mode: coverage");
  expect(freshOutput).not.toContain("function [stale]");

  expect(mixedLines[0]).toBe("Trust: partial");
  expect(mixedOutput).toContain("changed files: src/app.ts");
  expect(mixedOutput).toContain("trace path may be unreliable; refresh index before relying on this result");
  expect(mixedOutput).toContain("mode: coverage [stale]");
  expect(mixedOutput).toContain("prod  function [stale]");
  ```
- In `test/tool-trace-signals.test.ts`, replace only the stale coverage header/mode assertions with:
  ```ts
  expect(lines[0]).toBe("Trust: partial");
  expect(lines).toContain("mode: coverage [stale]");
  ```
  Keep the existing role-tag regex assertions unchanged.
- In `test/extension-suppress-trust-header-trace.test.ts`, replace the suppressed and baseline assertions with:
  ```ts
  expect(suppressedText.includes("## Trust")).toBe(false);
  expect(suppressedText.includes("Trust: ")).toBe(false);
  expect(suppressedText).toContain("mode: static (heuristic, no runtime evidence)");

  expect(baselineText.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")).toBe(true);
  ```
- In `test/extension-suppress-trust-header-interactions.test.ts`, replace the final trace test assertion:
  ```ts
  expect(omittedText.startsWith("## Trust\nstatus: heuristic")).toBe(true);
  ```
  with:
  ```ts
  expect(omittedText.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")).toBe(true);
  ```
- In `test/extension-readonly-trust-gating.test.ts`, replace the non-fresh trace expectation with:
  ```ts
  expect(text.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")).toBe(true);
  ```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-freshness-warning.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` for expected substring `"Trust: unknown"`

**Step 3 — Write minimal implementation**
Apply these exact edits to `src/tools/trace.ts`.

1. Replace the imports for `GraphNode` and trust with these imports:

```ts
import type { GraphStore } from "../graph/store.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { computeAnchor } from "../output/anchoring.js";
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
import { createSignalComputer, formatRoleTags, type NodeRole, type SignalComputer } from "../output/signals.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";
```

2. Add this helper immediately after `formatModeHeader(...)`:

```ts
function traceFreshness(
  params: TraceParams,
  targetNode: GraphNode,
  nodeIds: string[],
  unresolvedItems: string[] = [],
  resultEdges: GraphEdge[] = [],
) {
  const resultNodes = nodeIds.flatMap((id) => {
    const node = params.store.getNode(id);
    return node ? [node] : [];
  });
  return evaluateFreshness({
    store: params.store,
    projectRoot: params.projectRoot,
    targetNodes: [targetNode],
    resultNodes: [targetNode, ...resultNodes],
    resultEdges,
    unresolvedItems,
    recommendation: "trace path may be unreliable; refresh index before relying on this result",
  });
}
```

3. Replace the entire existing `trace(...)` function with this complete implementation:

```ts
export function trace(params: TraceParams): string {
  const resolved = resolveUniqueSymbol({
    name: params.entry,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
    notFoundLabel: "Symbol",
  });

  const emptyFreshness = evaluateFreshness({
    store: params.store,
    projectRoot: params.projectRoot,
    recommendation: "trace path may be unreliable; refresh index before relying on this result",
  });

  if (resolved.kind === "ambiguous") {
    return prependFreshnessHeader(resolved.text, emptyFreshness);
  }
  if (resolved.kind === "not_found") {
    if (params.file) {
      const unscopedMatches = params.store.findNodes(params.entry);
      if (unscopedMatches.length > 0) {
        const freshness = evaluateFreshness({
          store: params.store,
          projectRoot: params.projectRoot,
          resultNodes: unscopedMatches,
          recommendation: "trace path may be unreliable; refresh index before relying on this result",
        });
        return prependFreshnessHeader(
          formatFileScopedMiss(params.entry, params.file, unscopedMatches, params.projectRoot),
          freshness,
        );
      }
    }
    return prependFreshnessHeader(`Symbol "${params.entry}" not found in the graph\n`, emptyFreshness);
  }

  const node = resolved.node;
  const signalComputer = createSignalComputer(params.store);
  const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const orderedSteps = coverage.steps.sort((a, b) => a.ordinal - b.ordinal);
      const rendered = orderedSteps
        .map((step) => formatStoredTraceLine(params.store, step.nodeId, step.contentHash, params.projectRoot, signalComputer));
      const unresolvedItems = orderedSteps.filter((step) => !params.store.getNode(step.nodeId)).map((step) => step.nodeId);
      const freshness = traceFreshness(params, node, orderedSteps.map((step) => step.nodeId), unresolvedItems);
      const traceStale = rendered.some((item) => item.stale) || freshness.status !== "fresh";
      const body = `${[formatModeHeader("coverage", traceStale), ...rendered.map((item) => item.line)].join("\n")}\n`;
      return prependFreshnessHeader(body, freshness);
    }
  }

  if (node.kind === "class") {
    const classSignals = signalComputer.compute(node.id);
    const classLine = formatLiveTraceLine(
      params.store,
      node.id,
      params.projectRoot,
      signalComputer,
      classSignals.roles.filter((role) => role !== "leaf"),
    );
    const freshness = traceFreshness(params, node, [node.id]);
    const classStale = classLine.stale || freshness.status !== "fresh";
    const body = `${[
      formatModeHeader("static", classStale),
      classLine.line,
      "  → class entry: use symbol_graph to inspect methods, or trace a specific method symbol when one is available",
    ].join("\n")}\n`;
    return prependFreshnessHeader(body, freshness);
  }

  const staticNodeIds = buildStaticTrace(params.store, node.id);
  const staticSteps = staticNodeIds
    .map((step) => formatLiveTraceLine(params.store, step, params.projectRoot, signalComputer));
  const freshness = traceFreshness(params, node, staticNodeIds);
  const staticStale = staticSteps.some((step) => step.stale) || freshness.status !== "fresh";
  const body = `${[formatModeHeader("static", staticStale), ...staticSteps.map((step) => step.line)].join("\n")}\n`;
  return prependFreshnessHeader(body, freshness);
}
```

This task intentionally does not yet pass static `calls` edges into `traceFreshness`; Task 6 adds the dedicated stale static call-edge coverage and implementation.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-freshness-warning.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: Report stale static trace call edges [depends: 1, 2, 5]

### Task 6: Report stale static trace call edges [depends: 1, 2, 5]

**Covers:** AC 3, AC 10, AC 13, AC 14, AC 15

**Files:**
- Modify: `src/tools/trace.ts`
- Test: `test/tool-trace-static-edge-freshness.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-trace-static-edge-freshness.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

test("trace reports stale static call-edge freshness warning", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-static-edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const app = "export function entry() { return leaf(); }\nexport function leaf() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), app);
  const appHash = sha256Hex(app);
  const store = new SqliteGraphStore();

  try {
    store.addNode({ id: "src/app.ts::entry:1", kind: "function", name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: appHash, is_exported: true });
    store.addNode({ id: "src/app.ts::leaf:2", kind: "function", name: "leaf", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: appHash, is_exported: true });
    store.addEdge({
      source: "src/app.ts::entry:1",
      target: "src/app.ts::leaf:2",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "entry calls leaf", content_hash: "old-edge-hash" },
      created_at: 1,
    });
    store.setFileHash("src/app.ts", appHash);

    const output = trace({ entry: "entry", store, projectRoot });
    expect(output).toContain("Trust: partial");
    expect(output).toContain("stale edges: 1");
    expect(output).toContain("trace path may be unreliable; refresh index before relying on this result");
    expect(output).toContain("mode: static (heuristic, no runtime evidence) [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-static-edge-freshness.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` for expected substring `"Trust: partial"`

**Step 3 — Write minimal implementation**
Apply these exact edits to `src/tools/trace.ts`. Task 5 already imported `GraphEdge`, added `traceFreshness(...)`, and replaced `trace(...)`; this task only adds static call-edge collection and passes those edges into the existing freshness helper.

1. Add this helper immediately after `traceFreshness(...)`:

```ts
function collectStaticTraceEdges(store: GraphStore, nodeIds: string[]): GraphEdge[] {
  const included = new Set(nodeIds);
  const edges: GraphEdge[] = [];
  for (const sourceId of nodeIds) {
    for (const neighbor of store.getNeighbors(sourceId, { direction: "out", kind: "calls" })) {
      if (included.has(neighbor.node.id)) edges.push(neighbor.edge);
    }
  }
  return edges;
}
```

2. Replace the static fallback block at the end of `trace(...)` with this complete block:

```ts
  const staticNodeIds = buildStaticTrace(params.store, node.id);
  const staticSteps = staticNodeIds
    .map((step) => formatLiveTraceLine(params.store, step, params.projectRoot, signalComputer));
  const staticEdges = collectStaticTraceEdges(params.store, staticNodeIds);
  const freshness = traceFreshness(params, node, staticNodeIds, [], staticEdges);
  const staticStale = staticSteps.some((step) => step.stale) || freshness.status !== "fresh";
  const body = `${[formatModeHeader("static", staticStale), ...staticSteps.map((step) => step.line)].join("\n")}\n`;
  return prependFreshnessHeader(body, freshness);
```

This uses the existing `GraphStore.getNeighbors(nodeId, { direction: "out", kind: "calls" })` API and the `GraphEdge` type imported by Task 5.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-static-edge-freshness.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all tests pass and TypeScript check completes with no errors.
