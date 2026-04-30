---
id: 1
title: Add shared result-scoped freshness evaluator
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/output/freshness.ts
  - test/output-freshness-evaluator.test.ts
---

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
