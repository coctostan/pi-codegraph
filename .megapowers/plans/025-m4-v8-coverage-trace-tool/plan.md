# Plan

### Task 1: Add deterministic V8 coverage parser

### Task 1: Add deterministic V8 coverage parser
- Create: `src/indexer/coverage.ts`
- Create: `test/indexer-coverage-parser.test.ts`
**ACs covered:** 1, 2, 3, 4

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCoverageReports } from "../src/indexer/coverage.js";

test("parseCoverageReports normalizes coverage deterministically, ignores unsupported URLs, and skips malformed entries without aborting", () => {
  const projectRoot = join(tmpdir(), `pi-cg-coverage-parser-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(coverageDir, { recursive: true });

  const appSource = [
    "export function prod() {",
    "  return 1;",
    "}",
    "",
    "export function helper() {",
    "  return prod();",
    "}",
    "",
  ].join("\n");
  const testSource = [
    "export function prodTest() {",
    "  return 1;",
    "}",
    "",
  ].join("\n");

  writeFileSync(join(projectRoot, "src", "app.ts"), appSource);
  writeFileSync(join(projectRoot, "src", "app.test.ts"), testSource);

  const appText = readFileSync(join(projectRoot, "src", "app.ts"), "utf8");
  const testText = readFileSync(join(projectRoot, "src", "app.test.ts"), "utf8");
  const prodStart = appText.indexOf("export function prod");
  const prodEnd = appText.indexOf("\n\nexport function helper") + 1;
  const helperStart = appText.indexOf("export function helper");
  const helperEnd = appText.length;
  const testStart = testText.indexOf("export function prodTest");
  const testEnd = testText.length;

  writeFileSync(
    join(coverageDir, "b-report.json"),
    JSON.stringify({
      result: [
        {
          url: new URL(`file://${join(projectRoot, "src", "app.ts")}`).href,
          functions: [
            { functionName: "helper", ranges: [{ startOffset: helperStart, endOffset: helperEnd, count: 1 }] },
            { functionName: "prod", ranges: [{ startOffset: prodStart, endOffset: prodEnd, count: 1 }] },
          ],
        },
        {
          url: "https://example.com/outside.ts",
          functions: [
            { functionName: "external", ranges: [{ startOffset: 0, endOffset: 1, count: 1 }] },
          ],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "missing.ts")}`).href,
          functions: [
            { functionName: "broken", ranges: [{ startOffset: 0, endOffset: 1, count: 1 }] },
          ],
        },
      ],
    }),
  );

  writeFileSync(
    join(coverageDir, "a-report.json"),
    JSON.stringify({
      result: [
        {
          url: new URL(`file://${join(projectRoot, "src", "app.test.ts")}`).href,
          functions: [
            { functionName: "prodTest", ranges: [{ startOffset: testStart, endOffset: testEnd, count: 1 }] },
          ],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "notes.js")}`).href,
          functions: [
            { functionName: "ignoredJs", ranges: [{ startOffset: 0, endOffset: 1, count: 1 }] },
          ],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "app.ts")}`).href,
          functions: "not-an-array",
        },
      ],
    }),
  );

  writeFileSync(join(coverageDir, "c-malformed.json"), "{ not valid json");

  try {
    const first = parseCoverageReports(projectRoot, coverageDir);
    const second = parseCoverageReports(projectRoot, coverageDir);
    const expected = [
      ["src/app.test.ts", "prodTest", 1, 4],
      ["src/app.ts", "helper", 5, 8],
      ["src/app.ts", "prod", 1, 4],
    ];

    expect(first.map((record) => [record.file, record.functionName, record.startLine, record.endLine])).toEqual(expected);
    expect(second.map((record) => [record.file, record.functionName, record.startLine, record.endLine])).toEqual(expected);
    expect(first.some((record) => record.functionName === "external")).toBe(false);
    expect(first.some((record) => record.functionName === "ignoredJs")).toBe(false);
    expect(first.some((record) => record.functionName === "broken")).toBe(false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-coverage-parser.test.ts`
Expected: FAIL — `Cannot find module '../src/indexer/coverage.js' from 'test/indexer-coverage-parser.test.ts'`

**Step 3 — Write minimal implementation**
`src/indexer/coverage.ts`
```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface NormalizedCoverageRecord {
  reportFile: string;
  file: string;
  functionName: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  count: number;
}

function toPosixPath(value: string): string {
  return value.split("\\").join("/");
}

function countLineAtOffset(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < Math.min(offset, content.length); index++) {
    if (content[index] === "\n") line++;
  }
  return line;
}

function isProjectLocalTsFile(projectRoot: string, filePath: string): boolean {
  const resolvedRoot = resolve(projectRoot);
  const resolvedFile = resolve(filePath);
  if (!resolvedFile.startsWith(resolvedRoot)) return false;
  return resolvedFile.endsWith(".ts") || resolvedFile.endsWith(".tsx");
}

export function parseCoverageReports(projectRoot: string, coverageDir: string): NormalizedCoverageRecord[] {
  if (!existsSync(coverageDir)) return [];

  const records: NormalizedCoverageRecord[] = [];
  const fileNames = readdirSync(coverageDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of fileNames) {
    let raw: { result?: unknown[] };
    try {
      raw = JSON.parse(readFileSync(resolve(coverageDir, fileName), "utf8")) as { result?: unknown[] };
    } catch {
      continue;
    }

    for (const entry of raw.result ?? []) {
      try {
        if (!entry || typeof entry !== "object") continue;
        const url = (entry as { url?: unknown }).url;
        const functions = (entry as { functions?: unknown }).functions;
        if (typeof url !== "string" || !Array.isArray(functions)) continue;

        const filePath = url.startsWith("file://") ? fileURLToPath(url) : url;
        if (!isAbsolute(filePath) || !isProjectLocalTsFile(projectRoot, filePath)) continue;

        const content = readFileSync(filePath, "utf8");
        const relFile = toPosixPath(relative(projectRoot, filePath));

        for (const fn of functions) {
          if (!fn || typeof fn !== "object") continue;
          const functionName = (fn as { functionName?: unknown }).functionName;
          const ranges = (fn as { ranges?: unknown }).ranges;
          if (typeof functionName !== "string" || !Array.isArray(ranges)) continue;

          const firstCoveredRange = ranges.find((range) => {
            if (!range || typeof range !== "object") return false;
            const count = (range as { count?: unknown }).count;
            return typeof count === "number" && count > 0;
          }) as { startOffset: number; endOffset: number; count: number } | undefined;

          if (!firstCoveredRange) continue;
          if (typeof firstCoveredRange.startOffset !== "number") continue;
          if (typeof firstCoveredRange.endOffset !== "number") continue;
          if (typeof firstCoveredRange.count !== "number") continue;

          records.push({
            reportFile: fileName,
            file: relFile,
            functionName,
            startOffset: firstCoveredRange.startOffset,
            endOffset: firstCoveredRange.endOffset,
            startLine: countLineAtOffset(content, firstCoveredRange.startOffset),
            endLine: countLineAtOffset(content, Math.max(firstCoveredRange.endOffset - 1, firstCoveredRange.startOffset)),
            count: firstCoveredRange.count,
          });
        }
      } catch {
        continue;
      }
    }
  }

  return records.sort((a, b) => {
    return a.reportFile.localeCompare(b.reportFile)
      || a.file.localeCompare(b.file)
      || a.functionName.localeCompare(b.functionName)
      || a.startLine - b.startLine
      || a.endLine - b.endLine;
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-coverage-parser.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: Map coverage ranges to graph nodes [depends: 1]

### Task 2: Map coverage ranges to graph nodes [depends: 1]
**Files:**
- Modify: `src/indexer/coverage.ts`
- Create: `test/indexer-coverage-mapping.test.ts`
**ACs covered:** 5, 6

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { mapCoverageToNodes, type NormalizedCoverageRecord } from "../src/indexer/coverage.js";

test("mapCoverageToNodes resolves same-file overlapping nodes and prefers the smallest span", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/app.ts::outer:1", kind: "function", name: "outer", file: "src/app.ts", start_line: 1, end_line: 10, content_hash: "h-app" });
    store.addNode({ id: "src/app.ts::inner:3", kind: "function", name: "inner", file: "src/app.ts", start_line: 3, end_line: 5, content_hash: "h-app" });
    store.addNode({ id: "src/app.test.ts::appTest:1", kind: "test", name: "appTest", file: "src/app.test.ts", start_line: 1, end_line: 3, content_hash: "h-test" });

    const records: NormalizedCoverageRecord[] = [
      { reportFile: "report.json", file: "src/app.test.ts", functionName: "appTest", startOffset: 0, endOffset: 10, startLine: 1, endLine: 3, count: 1 },
      { reportFile: "report.json", file: "src/app.ts", functionName: "inner", startOffset: 20, endOffset: 40, startLine: 3, endLine: 5, count: 1 },
      { reportFile: "report.json", file: "src/missing.ts", functionName: "ghost", startOffset: 0, endOffset: 1, startLine: 1, endLine: 1, count: 1 },
    ];

    const mapped = mapCoverageToNodes(store, records);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({ file: "src/app.test.ts", node: { id: "src/app.test.ts::appTest:1", kind: "test" } });
    expect(mapped[1]).toMatchObject({ file: "src/app.ts", node: { id: "src/app.ts::inner:3", kind: "function" } });
    expect(mapped.some((item) => item.node.id === "src/app.ts::outer:1")).toBe(false);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-coverage-mapping.test.ts`
Expected: FAIL — `SyntaxError: Export named 'mapCoverageToNodes' not found in module '../src/indexer/coverage.js'`

**Step 3 — Write minimal implementation**
`src/indexer/coverage.ts` — extend the Task 1 file with:
```ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";

export interface MappedCoverageRecord extends NormalizedCoverageRecord {
  node: GraphNode;
}

function lineSpan(node: GraphNode): number {
  return (node.end_line ?? node.start_line) - node.start_line;
}

function overlaps(node: GraphNode, startLine: number, endLine: number): boolean {
  const nodeEnd = node.end_line ?? node.start_line;
  return node.start_line <= endLine && nodeEnd >= startLine;
}

export function mapCoverageToNodes(store: GraphStore, records: NormalizedCoverageRecord[]): MappedCoverageRecord[] {
  const mapped: MappedCoverageRecord[] = [];

  for (const record of records) {
    const candidates = store
      .getNodesByFile(record.file)
      .filter((node) => overlaps(node, record.startLine, record.endLine))
      .sort((a, b) => lineSpan(a) - lineSpan(b) || a.start_line - b.start_line || a.id.localeCompare(b.id));

    const resolved = candidates[0];
    if (!resolved) continue;
    mapped.push({ ...record, node: resolved });
  }

  return mapped.sort((a, b) => {
    return a.reportFile.localeCompare(b.reportFile)
      || a.file.localeCompare(b.file)
      || a.startLine - b.startLine
      || a.node.id.localeCompare(b.node.id);
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-coverage-mapping.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Persist coverage-backed test traces in SQLite [depends: 2]

### Task 3: Persist coverage-backed test traces in SQLite [depends: 2]

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Create: `test/graph-store-coverage-traces.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore saves, replaces, and loads per-test coverage traces with stored content hashes", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/app.test.ts::appTest:1", kind: "test", name: "appTest", file: "src/app.test.ts", start_line: 1, end_line: 3, content_hash: "h-test" });
    store.addNode({ id: "src/app.ts::prod:1", kind: "function", name: "prod", file: "src/app.ts", start_line: 1, end_line: 3, content_hash: "h-prod" });
    store.addNode({ id: "src/app.ts::helper:5", kind: "function", name: "helper", file: "src/app.ts", start_line: 5, end_line: 7, content_hash: "h-helper" });

    store.saveTestTrace({
      testNodeId: "src/app.test.ts::appTest:1",
      steps: [
        { nodeId: "src/app.test.ts::appTest:1", ordinal: 0, contentHash: "h-test" },
        { nodeId: "src/app.ts::prod:1", ordinal: 1, contentHash: "h-prod" },
      ],
    });

    store.saveTestTrace({
      testNodeId: "src/app.test.ts::appTest:1",
      steps: [
        { nodeId: "src/app.test.ts::appTest:1", ordinal: 0, contentHash: "h-test" },
        { nodeId: "src/app.ts::helper:5", ordinal: 1, contentHash: "h-helper" },
      ],
    });

    expect(store.getTestTrace("src/app.test.ts::appTest:1")).toEqual({
      testNodeId: "src/app.test.ts::appTest:1",
      steps: [
        { nodeId: "src/app.test.ts::appTest:1", ordinal: 0, contentHash: "h-test" },
        { nodeId: "src/app.ts::helper:5", ordinal: 1, contentHash: "h-helper" },
      ],
    });
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-coverage-traces.test.ts`
Expected: FAIL — `TypeError: store.saveTestTrace is not a function`

**Step 3 — Write minimal implementation**
`src/graph/store.ts`
```ts
import type { EdgeKind, GraphEdge, GraphNode } from "./types.js";

export interface NeighborOptions {
  kind?: EdgeKind;
  direction?: "in" | "out" | "both";
}

export interface NeighborResult {
  node: GraphNode;
  edge: GraphEdge;
}

export interface TestTraceStep {
  nodeId: string;
  ordinal: number;
  contentHash: string;
}

export interface TestTraceRecord {
  testNodeId: string;
  steps: TestTraceStep[];
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
  getUnresolvedEdges(): GraphEdge[];
  getEdgesBySource(sourceId: string): GraphEdge[];
  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void;
  saveTestTrace(trace: TestTraceRecord): void;
  getTestTrace(testNodeId: string): TestTraceRecord | null;
  close(): void;
}
```

`src/graph/sqlite.ts`
```ts
import { createRequire } from "node:module";
import type { GraphStore, NeighborOptions, NeighborResult, TestTraceRecord, TestTraceStep } from "./store.js";
import type { GraphEdge, GraphNode } from "./types.js";
const _require = createRequire(import.meta.url);
function openDb(path: string): any {
  if ((process.versions as any).bun) {
    const { Database } = _require("bun:sqlite");
    return new Database(path);
  }
  const { DatabaseSync } = _require("node:sqlite");
  return new DatabaseSync(path);
}

interface NeighborRow {
  id: string;
  kind: GraphNode["kind"];
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
  source: string;
  target: string;
  edge_kind: GraphEdge["kind"];
  provenance_source: GraphEdge["provenance"]["source"];
  confidence: number;
  evidence: string;
  edge_hash: string;
  created_at: number;
}

export class SqliteGraphStore implements GraphStore {
  private db: any;

  constructor(dbPath: string = ":memory:") {
    this.db = openDb(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        file TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER,
        content_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS edges (
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        kind TEXT NOT NULL,
        provenance_source TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source, target, kind, provenance_source)
      );

      CREATE TABLE IF NOT EXISTS file_hashes (
        file TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS test_trace_steps (
        test_node_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        PRIMARY KEY (test_node_id, ordinal)
      );

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
    `);

    const existing = this.db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | null;
    if (!existing) {
      this.db.prepare("INSERT INTO schema_version(version) VALUES (1)").run();
    }
  }

  addNode(node: GraphNode): void {
    this.db.prepare(`INSERT OR REPLACE INTO nodes (id, kind, name, file, start_line, end_line, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(node.id, node.kind, node.name, node.file, node.start_line, node.end_line ?? null, node.content_hash);
  }

  addEdge(edge: GraphEdge): void {
    this.db.prepare(`INSERT OR REPLACE INTO edges (source, target, kind, provenance_source, confidence, evidence, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(edge.source, edge.target, edge.kind, edge.provenance.source, edge.provenance.confidence, edge.provenance.evidence, edge.provenance.content_hash, edge.created_at);
  }

  getNode(id: string): GraphNode | null {
    const row = this.db.prepare(`SELECT id, kind, name, file, start_line, end_line, content_hash FROM nodes WHERE id = ?`).get(id) as GraphNode | null;
    return row ? { ...row } : null;
  }

  findNodes(name: string, file?: string): GraphNode[] {
    const sql = file
      ? `SELECT id, kind, name, file, start_line, end_line, content_hash FROM nodes WHERE name = ? AND file = ?`
      : `SELECT id, kind, name, file, start_line, end_line, content_hash FROM nodes WHERE name = ?`;
    const rows = (file ? this.db.prepare(sql).all(name, file) : this.db.prepare(sql).all(name)) as GraphNode[];
    return rows.map((row) => ({ ...row }));
  }

  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[] {
    const direction = options?.direction ?? "both";
    const kind = options?.kind;
    if (direction === "out") return this.fetchNeighborRows(nodeId, "out", kind);
    if (direction === "in") return this.fetchNeighborRows(nodeId, "in", kind);
    return [...this.fetchNeighborRows(nodeId, "out", kind), ...this.fetchNeighborRows(nodeId, "in", kind)];
  }

  private fetchNeighborRows(nodeId: string, direction: "in" | "out", kind?: GraphEdge["kind"]): NeighborResult[] {
    const [joinOn, whereField] = direction === "out" ? ["e.target", "e.source"] : ["e.source", "e.target"];
    const baseSQL = `
      SELECT n.id, n.kind, n.name, n.file, n.start_line, n.end_line, n.content_hash,
             e.source, e.target, e.kind as edge_kind,
             e.provenance_source, e.confidence, e.evidence,
             e.content_hash as edge_hash, e.created_at
      FROM edges e
      JOIN nodes n ON n.id = ${joinOn}
      WHERE ${whereField} = ?`;
    const sql = kind ? `${baseSQL} AND e.kind = ?` : baseSQL;
    const rows = (kind ? this.db.prepare(sql).all(nodeId, kind) : this.db.prepare(sql).all(nodeId)) as NeighborRow[];
    return rows.map((row) => ({
      node: { id: row.id, kind: row.kind, name: row.name, file: row.file, start_line: row.start_line, end_line: row.end_line, content_hash: row.content_hash },
      edge: {
        source: row.source,
        target: row.target,
        kind: row.edge_kind,
        provenance: { source: row.provenance_source, confidence: row.confidence, evidence: row.evidence, content_hash: row.edge_hash },
        created_at: row.created_at,
      },
    }));
  }

  private static edgeFromRow(row: { source: string; target: string; kind: string; provenance_source: string; confidence: number; evidence: string; content_hash: string; created_at: number }): GraphEdge {
    return {
      source: row.source,
      target: row.target,
      kind: row.kind as GraphEdge["kind"],
      provenance: { source: row.provenance_source as GraphEdge["provenance"]["source"], confidence: row.confidence, evidence: row.evidence, content_hash: row.content_hash },
      created_at: row.created_at,
    };
  }

  getUnresolvedEdges(): GraphEdge[] {
    const rows = this.db.prepare(`SELECT source, target, kind, provenance_source, confidence, evidence, content_hash, created_at FROM edges WHERE SUBSTR(target, 1, 16) = '__unresolved__::' ORDER BY created_at ASC`).all() as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  getEdgesBySource(sourceId: string): GraphEdge[] {
    const rows = this.db.prepare(`SELECT source, target, kind, provenance_source, confidence, evidence, content_hash, created_at FROM edges WHERE source = ? ORDER BY created_at ASC`).all(sourceId) as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void {
    this.db.prepare(`DELETE FROM edges WHERE source = ? AND target = ? AND kind = ? AND provenance_source = ?`).run(source, target, kind, provenanceSource);
  }

  getNodesByFile(file: string): GraphNode[] {
    const rows = this.db.prepare(`SELECT id, kind, name, file, start_line, end_line, content_hash FROM nodes WHERE file = ? ORDER BY start_line ASC, id ASC`).all(file) as GraphNode[];
    return rows.map((row) => ({ ...row }));
  }

  deleteFile(file: string): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM edges WHERE provenance_source != 'agent' AND (source IN (SELECT id FROM nodes WHERE file = ?) OR target IN (SELECT id FROM nodes WHERE file = ?))`).run(file, file);
      this.db.prepare(`DELETE FROM test_trace_steps WHERE test_node_id IN (SELECT id FROM nodes WHERE file = ?) OR node_id IN (SELECT id FROM nodes WHERE file = ?)`).run(file, file);
      this.db.prepare(`DELETE FROM nodes WHERE file = ?`).run(file);
      this.db.prepare(`DELETE FROM file_hashes WHERE file = ?`).run(file);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listFiles(): string[] {
    const rows = this.db.prepare("SELECT file FROM file_hashes ORDER BY file ASC").all() as Array<{ file: string }>;
    return rows.map((row) => row.file);
  }

  getFileHash(file: string): string | null {
    const row = this.db.prepare(`SELECT hash FROM file_hashes WHERE file = ?`).get(file) as { hash: string } | null;
    return row?.hash ?? null;
  }

  setFileHash(file: string, hash: string): void {
    this.db.prepare(`INSERT OR REPLACE INTO file_hashes (file, hash, indexed_at) VALUES (?, ?, ?)`).run(file, hash, Date.now());
  }

  saveTestTrace(trace: TestTraceRecord): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM test_trace_steps WHERE test_node_id = ?`).run(trace.testNodeId);
      const insert = this.db.prepare(`INSERT INTO test_trace_steps (test_node_id, ordinal, node_id, content_hash) VALUES (?, ?, ?, ?)`);
      for (const step of trace.steps) {
        insert.run(trace.testNodeId, step.ordinal, step.nodeId, step.contentHash);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getTestTrace(testNodeId: string): TestTraceRecord | null {
    const rows = this.db.prepare(`SELECT test_node_id, ordinal, node_id, content_hash FROM test_trace_steps WHERE test_node_id = ? ORDER BY ordinal ASC`).all(testNodeId) as Array<{ test_node_id: string; ordinal: number; node_id: string; content_hash: string }>;
    if (rows.length === 0) return null;
    const steps: TestTraceStep[] = rows.map((row) => ({ nodeId: row.node_id, ordinal: row.ordinal, contentHash: row.content_hash }));
    return { testNodeId: rows[0]!.test_node_id, steps };
  }

  close(): void {
    this.db.close();
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-coverage-traces.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Index coverage artifacts into tested_by edges and stored traces [depends: 1, 2, 3]

### Task 4: Index coverage artifacts into tested_by edges and stored traces [depends: 1, 2, 3]
- Modify: `src/indexer/coverage.ts`
- Modify: `src/indexer/pipeline.ts`
- Create: `test/indexer-coverage-stage.test.ts`
**ACs covered:** 6, 7, 8, 9, 10, 11

**Step 1 — Write the failing tests**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

test("indexProject coverage stage creates coverage tested_by edges and deterministic test trace", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-stage4-edge-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(coverageDir, { recursive: true });

  const appSource = [
    "export function prod() {",
    "  return helper();",
    "}",
    "",
    "export function helper() {",
    "  return 1;",
    "}",
    "",
  ].join("\n");
  const testSource = [
    "export function prodTest() {",
    "  return prod();",
    "}",
    "",
  ].join("\n");

  writeFileSync(join(projectRoot, "src", "app.ts"), appSource);
  writeFileSync(join(projectRoot, "src", "app.test.ts"), testSource);

  const appText = readFileSync(join(projectRoot, "src", "app.ts"), "utf8");
  const testText = readFileSync(join(projectRoot, "src", "app.test.ts"), "utf8");

  writeFileSync(
    join(coverageDir, "report.json"),
    JSON.stringify({
      result: [
        {
          url: new URL(`file://${join(projectRoot, "src", "app.test.ts")}`).href,
          functions: [
            {
              functionName: "prodTest",
              ranges: [{ startOffset: testText.indexOf("export function prodTest"), endOffset: testText.length, count: 1 }],
            },
          ],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "app.ts")}`).href,
          functions: [
            {
              functionName: "prod",
              ranges: [{ startOffset: appText.indexOf("export function prod"), endOffset: appText.indexOf("\n\nexport function helper") + 1, count: 1 }],
            },
            {
              functionName: "helper",
              ranges: [{ startOffset: appText.indexOf("export function helper"), endOffset: appText.length, count: 1 }],
            },
          ],
        },
      ],
    }),
  );

  const store = new SqliteGraphStore();
  try {
    await indexProject(projectRoot, store, {
      lspClientFactory: () => fakeClient,
      coverageDir,
    });

    const prodNode = store.findNodes("prod", "src/app.ts")[0]!;
    const helperNode = store.findNodes("helper", "src/app.ts")[0]!;
    const testNode = store.findNodes("prodTest", "src/app.test.ts")[0]!;
    const testedBy = store.getNeighbors(prodNode.id, { direction: "out", kind: "tested_by" });

    expect(testedBy).toHaveLength(1);
    expect(testedBy[0]!.node.id).toBe(testNode.id);
    expect(testedBy[0]!.edge.provenance.source).toBe("coverage");
    expect(store.getTestTrace(testNode.id)).toEqual({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: testNode.content_hash },
        { nodeId: prodNode.id, ordinal: 1, contentHash: prodNode.content_hash },
        { nodeId: helperNode.id, ordinal: 2, contentHash: helperNode.content_hash },
      ],
    });
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("indexProject coverage stage does not duplicate tested_by edges on rerun", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-stage4-dedupe-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(coverageDir, { recursive: true });

  const appSource = "export function prod() { return 1; }\n";
  const testSource = "export function prodTest() { return prod(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), appSource);
  writeFileSync(join(projectRoot, "src", "app.test.ts"), testSource);

  const appText = readFileSync(join(projectRoot, "src", "app.ts"), "utf8");
  const testText = readFileSync(join(projectRoot, "src", "app.test.ts"), "utf8");

  writeFileSync(
    join(coverageDir, "report.json"),
    JSON.stringify({
      result: [
        {
          url: new URL(`file://${join(projectRoot, "src", "app.test.ts")}`).href,
          functions: [{ functionName: "prodTest", ranges: [{ startOffset: testText.indexOf("export function prodTest"), endOffset: testText.length, count: 1 }] }],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "app.ts")}`).href,
          functions: [{ functionName: "prod", ranges: [{ startOffset: appText.indexOf("export function prod"), endOffset: appText.length, count: 1 }] }],
        },
      ],
    }),
  );

  const store = new SqliteGraphStore();
  try {
    await indexProject(projectRoot, store, { lspClientFactory: () => fakeClient, coverageDir });
    await indexProject(projectRoot, store, { lspClientFactory: () => fakeClient, coverageDir });

    const prodNode = store.findNodes("prod", "src/app.ts")[0]!;
    const testedByAgain = store.getNeighbors(prodNode.id, { direction: "out", kind: "tested_by" });
    expect(testedByAgain).toHaveLength(1);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-coverage-stage.test.ts`
Expected: FAIL — `expect(received).toHaveLength(expected)` with `Expected length: 1` and `Received length: 0` because coverage stage wiring and persistence are not implemented yet.

**Step 3 — Write minimal implementation**
`src/indexer/coverage.ts` — extend the Task 1/2 file with a new stage function:
```ts
import type { GraphStore, TestTraceRecord } from "../graph/store.js";

export function runCoverageIndexStage(store: GraphStore, projectRoot: string, coverageDir: string): void {
  const normalized = parseCoverageReports(projectRoot, coverageDir);
  const mapped = mapCoverageToNodes(store, normalized);
  const byReport = new Map<string, MappedCoverageRecord[]>();

  for (const record of mapped) {
    const group = byReport.get(record.reportFile) ?? [];
    group.push(record);
    byReport.set(record.reportFile, group);
  }

  const reportNames = [...byReport.keys()].sort((a, b) => a.localeCompare(b));
  for (const reportFile of reportNames) {
    const group = byReport.get(reportFile)!;
    const tests = group
      .filter((record) => record.node.kind === "test")
      .sort((a, b) => a.node.id.localeCompare(b.node.id));
    const production = group
      .filter((record) => record.node.kind !== "test")
      .sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine || a.node.id.localeCompare(b.node.id));

    for (const testRecord of tests) {
      for (const prodRecord of production) {
        store.addEdge({
          source: prodRecord.node.id,
          target: testRecord.node.id,
          kind: "tested_by",
          provenance: {
            source: "coverage",
            confidence: 1,
            evidence: `${reportFile}:${testRecord.file}:${testRecord.startLine}`,
            content_hash: prodRecord.node.content_hash,
          },
          created_at: testRecord.startLine,
        });
      }

      const trace: TestTraceRecord = {
        testNodeId: testRecord.node.id,
        steps: [
          { nodeId: testRecord.node.id, ordinal: 0, contentHash: testRecord.node.content_hash },
          ...production.map((record, index) => ({
            nodeId: record.node.id,
            ordinal: index + 1,
            contentHash: record.node.content_hash,
          })),
        ],
      };
      store.saveTestTrace(trace);
    }
  }
}
```

`src/indexer/pipeline.ts` — make targeted edits to the current file:
```ts
import { runCoverageIndexStage } from "./coverage.js";
```

```ts
export interface IndexProjectOptions {
  lspClientFactory?: (projectRoot: string) => ITsServerClient;
  coverageDir?: string;
}
```

```ts
await runAstGrepIndexStage(store, projectRoot, changedFiles);
runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
return { indexed, skipped, removed, errors };
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-coverage-stage.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Return coverage-backed traces for tests and production symbols [depends: 3, 4]

### Task 5: Return coverage-backed traces for tests and production symbols [depends: 3, 4]
- Create: `src/tools/trace.ts`
- Create: `test/tool-trace-coverage.test.ts`
**ACs covered:** 12, 13, 17, 19

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace returns stored coverage traces for tests and deterministically selects one covering test for a production symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-coverage-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function prod() { return helper(); }\nexport function helper() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "app.test.ts"), "export function alphaTest() { return prod(); }\nexport function betaTest() { return prod(); }\n");

  const store = new SqliteGraphStore();
  try {
    const alpha = { id: "src/app.test.ts::alphaTest:1", kind: "test" as const, name: "alphaTest", file: "src/app.test.ts", start_line: 1, end_line: 1, content_hash: "h-test" };
    const beta = { id: "src/app.test.ts::betaTest:2", kind: "test" as const, name: "betaTest", file: "src/app.test.ts", start_line: 2, end_line: 2, content_hash: "h-test" };
    const prod = { id: "src/app.ts::prod:1", kind: "function" as const, name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h-app" };
    const helper = { id: "src/app.ts::helper:2", kind: "function" as const, name: "helper", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: "h-app" };

    store.addNode(alpha);
    store.addNode(beta);
    store.addNode(prod);
    store.addNode(helper);
    store.addEdge({ source: prod.id, target: alpha.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "alpha", content_hash: prod.content_hash }, created_at: 1 });
    store.addEdge({ source: prod.id, target: beta.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "beta", content_hash: prod.content_hash }, created_at: 2 });

    store.saveTestTrace({
      testNodeId: alpha.id,
      steps: [
        { nodeId: alpha.id, ordinal: 0, contentHash: alpha.content_hash },
        { nodeId: prod.id, ordinal: 1, contentHash: prod.content_hash },
        { nodeId: helper.id, ordinal: 2, contentHash: helper.content_hash },
      ],
    });

    store.saveTestTrace({
      testNodeId: beta.id,
      steps: [
        { nodeId: beta.id, ordinal: 0, contentHash: beta.content_hash },
        { nodeId: prod.id, ordinal: 1, contentHash: prod.content_hash },
      ],
    });

    const direct = trace({ entry: "alphaTest", file: "src/app.test.ts", store, projectRoot });
    const byProd = trace({ entry: "prod", file: "src/app.ts", store, projectRoot });

    expect(direct).toContain("mode: coverage");
    expect(direct).toContain("src/app.test.ts:1:");
    expect(direct).toContain("src/app.ts:1:");
    expect(direct).toContain("src/app.ts:2:");
    expect(byProd).toContain("alphaTest");
    expect(byProd).not.toContain("betaTest");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-coverage.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/trace.js' from 'test/tool-trace-coverage.test.ts'`

**Step 3 — Write minimal implementation**
`src/tools/trace.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";

export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}

function resolveNode(store: GraphStore, entry: string, file?: string) {
  const matches = store.findNodes(entry, file);
  if (matches.length !== 1) return null;
  return matches[0]!;
}

function formatTraceLine(store: GraphStore, nodeId: string, projectRoot: string): string {
  const node = store.getNode(nodeId);
  if (!node) return `${nodeId}  unresolved`;
  const { anchor } = computeAnchor(node, projectRoot);
  return `${anchor}  ${node.name}  ${node.kind}`;
}

function pickCoverageTraceForNode(store: GraphStore, nodeId: string): string | null {
  const coveringTests = store
    .getNeighbors(nodeId, { direction: "out", kind: "tested_by" })
    .sort((a, b) => a.node.id.localeCompare(b.node.id));

  for (const candidate of coveringTests) {
    const record = store.getTestTrace(candidate.node.id);
    if (record) return record.testNodeId;
  }

  return null;
}

function resolveCoverageTraceId(store: GraphStore, nodeId: string): string | null {
  const node = store.getNode(nodeId);
  if (!node) return null;
  if (node.kind === "test") return node.id;
  return pickCoverageTraceForNode(store, node.id);
}

export function trace(params: TraceParams): string {
  const node = resolveNode(params.store, params.entry, params.file);
  if (!node) return `Entry "${params.entry}" not found`;

  const testTraceId = resolveCoverageTraceId(params.store, node.id);
  if (!testTraceId) return `Entry "${params.entry}" not found`;

  const record = params.store.getTestTrace(testTraceId);
  if (!record) return `Entry "${params.entry}" not found`;

  const lines = ["mode: coverage"];
  for (const step of [...record.steps].sort((a, b) => a.ordinal - b.ordinal)) {
    lines.push(formatTraceLine(params.store, step.nodeId, params.projectRoot));
  }
  return `${lines.join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-coverage.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: Resolve endpoint entries to coverage-backed traces [depends: 5]

### Task 6: Resolve endpoint entries to coverage-backed traces [depends: 5]
- Modify: `src/tools/trace.ts`
- Create: `test/tool-trace-endpoint.test.ts`
**ACs covered:** 14
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";
test("trace resolves endpoint entries through routes_to edges to the same deterministic coverage-backed trace policy", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-endpoint-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "api.ts"), "export function handler() { return service(); }\nexport function service() { return 1; }\napp.get('/users', handler);\n");
  writeFileSync(join(projectRoot, "src", "api.test.ts"), "export function usersTest() { return handler(); }\n");
  const store = new SqliteGraphStore();
  try {
    const endpoint = { id: "endpoint:GET:/users", kind: "endpoint" as const, name: "endpoint:GET:/users", file: "src/api.ts", start_line: 3, end_line: 3, content_hash: "h-api" };
    const handler = { id: "src/api.ts::handler:1", kind: "function" as const, name: "handler", file: "src/api.ts", start_line: 1, end_line: 1, content_hash: "h-api" };
    const service = { id: "src/api.ts::service:2", kind: "function" as const, name: "service", file: "src/api.ts", start_line: 2, end_line: 2, content_hash: "h-api" };
    const testNode = { id: "src/api.test.ts::usersTest:1", kind: "test" as const, name: "usersTest", file: "src/api.test.ts", start_line: 1, end_line: 1, content_hash: "h-test" };
    store.addNode(endpoint);
    store.addNode(handler);
    store.addNode(service);
    store.addNode(testNode);
    store.addEdge({
      source: handler.id,
      target: endpoint.id,
      kind: "routes_to",
      provenance: { source: "ast-grep", confidence: 0.9, evidence: "app.get('/users', handler)", content_hash: "h-api" },
      created_at: 1,
    });
    store.addEdge({
      source: handler.id,
      target: testNode.id,
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 1, evidence: "users", content_hash: handler.content_hash },
      created_at: 2,
    });
    store.saveTestTrace({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: testNode.content_hash },
        { nodeId: handler.id, ordinal: 1, contentHash: handler.content_hash },
        { nodeId: service.id, ordinal: 2, contentHash: service.content_hash },
      ],
    });
    const output = trace({ entry: "endpoint:GET:/users", store, projectRoot });
    expect(output).toContain("mode: coverage");
    expect(output).toContain("usersTest");
    expect(output).toContain("handler");
    expect(output).toContain("service");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-endpoint.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because the current implementation does not resolve endpoint entries through `routes_to`
**Step 3 — Write minimal implementation**
`src/tools/trace.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}
function resolveNode(store: GraphStore, entry: string, file?: string) {
  const matches = store.findNodes(entry, file);
  if (matches.length !== 1) return null;
  return matches[0]!;
}
function formatTraceLine(store: GraphStore, nodeId: string, projectRoot: string): string {
  const node = store.getNode(nodeId);
  if (!node) return `${nodeId}  unresolved`;
  const { anchor } = computeAnchor(node, projectRoot);
  return `${anchor}  ${node.name}  ${node.kind}`;
}
function pickCoverageTraceForNode(store: GraphStore, nodeId: string): string | null {
  const coveringTests = store
    .getNeighbors(nodeId, { direction: "out", kind: "tested_by" })
    .sort((a, b) => a.node.id.localeCompare(b.node.id));
  for (const candidate of coveringTests) {
    const trace = store.getTestTrace(candidate.node.id);
    if (trace) return trace.testNodeId;
  }

  return null;
}
function resolveCoverageTraceId(store: GraphStore, nodeId: string): string | null {
  const node = store.getNode(nodeId);
  if (!node) return null;
  if (node.kind === "test") return node.id;
  if (node.kind === "endpoint") {
    const handlers = store
      .getNeighbors(node.id, { direction: "in", kind: "routes_to" })
      .sort((a, b) => a.node.id.localeCompare(b.node.id));
    for (const handler of handlers) {
      const traceId = pickCoverageTraceForNode(store, handler.node.id);
      if (traceId) return traceId;
    }
    return null;
  }
  return pickCoverageTraceForNode(store, node.id);
}
export function trace(params: TraceParams): string {
  const node = resolveNode(params.store, params.entry, params.file);
  if (!node) return `Entry "${params.entry}" not found`;

  const testTraceId = resolveCoverageTraceId(params.store, node.id);
  if (!testTraceId) return `Entry "${params.entry}" not found`;

  const record = params.store.getTestTrace(testTraceId);
  if (!record) return `Entry "${params.entry}" not found`;

  const lines = ["mode: coverage"];
  for (const step of [...record.steps].sort((a, b) => a.ordinal - b.ordinal)) {
    lines.push(formatTraceLine(params.store, step.nodeId, params.projectRoot));
  }
  return `${lines.join("\n")}\n`;
}
```
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-endpoint.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: Fall back to deterministic static traces when coverage is missing [depends: 5, 6]

### Task 7: Fall back to deterministic static traces when coverage is missing [depends: 5, 6]
**Files:**
- Modify: `src/tools/trace.ts`
- Create: `test/tool-trace-static-fallback.test.ts`
**ACs covered:** 15

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace falls back to a deterministic static call path when no coverage trace exists", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-static-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function entry() { return first(); }\nexport function first() { return second(); }\nexport function second() { return 1; }\n",
  );

  const store = new SqliteGraphStore();
  try {
    const entry = { id: "src/app.ts::entry:1", kind: "function" as const, name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h-app" };
    const first = { id: "src/app.ts::first:2", kind: "function" as const, name: "first", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: "h-app" };
    const second = { id: "src/app.ts::second:3", kind: "function" as const, name: "second", file: "src/app.ts", start_line: 3, end_line: 3, content_hash: "h-app" };

    store.addNode(entry);
    store.addNode(first);
    store.addNode(second);
    store.addEdge({ source: entry.id, target: first.id, kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "first", content_hash: "h-app" }, created_at: 1 });
    store.addEdge({ source: first.id, target: second.id, kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "second", content_hash: "h-app" }, created_at: 2 });

    const output = trace({ entry: "entry", file: "src/app.ts", store, projectRoot });
    expect(output).toContain("mode: static");
    expect(output).toContain("entry");
    expect(output).toContain("first");
    expect(output).toContain("second");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-static-fallback.test.ts`
Expected: FAIL — `expect(received).toContain("mode: static")` because the current implementation returns `Entry "entry" not found` when no coverage trace is available.

**Step 3 — Write minimal implementation**
`src/tools/trace.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";

export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}

function resolveNode(store: GraphStore, entry: string, file?: string) {
  const matches = store.findNodes(entry, file);
  if (matches.length !== 1) return null;
  return matches[0]!;
}

function formatTraceLine(store: GraphStore, nodeId: string, projectRoot: string): string {
  const node = store.getNode(nodeId);
  if (!node) return `${nodeId}  unresolved`;
  const { anchor } = computeAnchor(node, projectRoot);
  return `${anchor}  ${node.name}  ${node.kind}`;
}

function pickCoverageTraceForNode(store: GraphStore, nodeId: string): string | null {
  const coveringTests = store
    .getNeighbors(nodeId, { direction: "out", kind: "tested_by" })
    .sort((a, b) => a.node.id.localeCompare(b.node.id));
  for (const candidate of coveringTests) {
    const record = store.getTestTrace(candidate.node.id);
    if (record) return record.testNodeId;
  }
  return null;
}

function resolveCoverageTraceId(store: GraphStore, nodeId: string): string | null {
  const node = store.getNode(nodeId);
  if (!node) return null;
  if (node.kind === "test") return node.id;
  if (node.kind === "endpoint") {
    const handlers = store
      .getNeighbors(node.id, { direction: "in", kind: "routes_to" })
      .sort((a, b) => a.node.id.localeCompare(b.node.id));
    for (const handler of handlers) {
      const traceId = pickCoverageTraceForNode(store, handler.node.id);
      if (traceId) return traceId;
    }
    return null;
  }
  return pickCoverageTraceForNode(store, node.id);
}

function buildStaticTrace(store: GraphStore, startNodeId: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = startNodeId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    ordered.push(currentId);
    const next = store
      .getNeighbors(currentId, { direction: "out", kind: "calls" })
      .sort((a, b) => a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || a.node.id.localeCompare(b.node.id))[0];
    currentId = next?.node.id ?? null;
  }

  return ordered;
}

export function trace(params: TraceParams): string {
  const node = resolveNode(params.store, params.entry, params.file);
  if (!node) return `Entry "${params.entry}" not found`;

  const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const lines = ["mode: coverage"];
      for (const step of [...coverage.steps].sort((a, b) => a.ordinal - b.ordinal)) {
        lines.push(formatTraceLine(params.store, step.nodeId, params.projectRoot));
      }
      return `${lines.join("\n")}\n`;
    }
  }

  const staticSteps = buildStaticTrace(params.store, node.id);
  return `${["mode: static", ...staticSteps.map((step) => formatTraceLine(params.store, step, params.projectRoot))].join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-static-fallback.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 8: Mark stale and unresolved trace steps without failing the trace [depends: 3, 6, 7]

### Task 8: Mark stale and unresolved trace steps without failing the trace [depends: 3, 6, 7]
- Modify: `src/tools/trace.ts`
- Create: `test/tool-trace-stale.test.ts`
**ACs covered:** 16, 18
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";
test("trace marks stale and unresolved stored steps without failing the whole trace", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function prod() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "app.test.ts"), "export function prodTest() { return prod(); }\n");
  const store = new SqliteGraphStore();
  try {
    const prod = { id: "src/app.ts::prod:1", kind: "function" as const, name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "old-app-hash" };
    const testNode = { id: "src/app.test.ts::prodTest:1", kind: "test" as const, name: "prodTest", file: "src/app.test.ts", start_line: 1, end_line: 1, content_hash: "old-test-hash" };
    store.addNode(testNode);
    store.addEdge({ source: prod.id, target: testNode.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "prod", content_hash: "old-app-hash" }, created_at: 1 });
    store.saveTestTrace({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: "old-test-hash" },
        { nodeId: prod.id, ordinal: 1, contentHash: "old-app-hash" },
        { nodeId: "src/app.ts::removed:9", ordinal: 2, contentHash: "old-removed-hash" },
      ],
    });
    const output = trace({ entry: "prodTest", file: "src/app.test.ts", store, projectRoot });
    expect(output).toContain("mode: coverage [stale]");
    expect(output).toContain("src/app.test.ts:1:");
    expect(output).toContain("[stale]");
    expect(output).toContain("src/app.ts::removed:9  unresolved [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-stale.test.ts`
Expected: FAIL — `expect(received).toContain("[stale]")` because the current implementation does not compare stored step hashes to current content
**Step 3 — Write minimal implementation**
`src/tools/trace.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}
function resolveNode(store: GraphStore, entry: string, file?: string) {
  const matches = store.findNodes(entry, file);
  if (matches.length !== 1) return null;
  return matches[0]!;
}
function pickCoverageTraceForNode(store: GraphStore, nodeId: string): string | null {
  const coveringTests = store.getNeighbors(nodeId, { direction: "out", kind: "tested_by" }).sort((a, b) => a.node.id.localeCompare(b.node.id));
  for (const candidate of coveringTests) {
    const record = store.getTestTrace(candidate.node.id);
    if (record) return record.testNodeId;
  }
  return null;
}
function resolveCoverageTraceId(store: GraphStore, nodeId: string): string | null {
  const node = store.getNode(nodeId);
  if (!node) return null;
  if (node.kind === "test") return node.id;
  if (node.kind === "endpoint") {
    const handlers = store.getNeighbors(node.id, { direction: "in", kind: "routes_to" }).sort((a, b) => a.node.id.localeCompare(b.node.id));
    for (const handler of handlers) {
      const traceId = pickCoverageTraceForNode(store, handler.node.id);
      if (traceId) return traceId;
    }
    return null;
  }
  return pickCoverageTraceForNode(store, node.id);
}
function buildStaticTrace(store: GraphStore, startNodeId: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = startNodeId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    ordered.push(currentId);
    const next = store
      .getNeighbors(currentId, { direction: "out", kind: "calls" })
      .sort((a, b) => a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || a.node.id.localeCompare(b.node.id))[0];
    currentId = next?.node.id ?? null;
  }
  return ordered;
}
function formatStoredTraceLine(store: GraphStore, nodeId: string, storedHash: string, projectRoot: string): { line: string; stale: boolean } {
  const node = store.getNode(nodeId);
  if (!node) {
    return { line: `${nodeId}  unresolved [stale]`, stale: true };
  }
  const anchor = computeAnchor(node, projectRoot);
  const stale = anchor.stale || node.content_hash !== storedHash;
  return {
    line: `${anchor.anchor}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""}`,
    stale,
  };
}
function formatLiveTraceLine(store: GraphStore, nodeId: string, projectRoot: string): string {
  const node = store.getNode(nodeId);
  if (!node) return `${nodeId}  unresolved [stale]`;
  const anchor = computeAnchor(node, projectRoot);
  return `${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}`;
}
export function trace(params: TraceParams): string {
  const node = resolveNode(params.store, params.entry, params.file);
  if (!node) return `Entry "${params.entry}" not found`;

  const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const rendered = coverage.steps.sort((a, b) => a.ordinal - b.ordinal).map((step) => formatStoredTraceLine(params.store, step.nodeId, step.contentHash, params.projectRoot));
      const traceStale = rendered.some((item) => item.stale);
      return `${[`mode: coverage${traceStale ? " [stale]" : ""}`, ...rendered.map((item) => item.line)].join("\n")}\n`;
    }
  }
  const staticSteps = buildStaticTrace(params.store, node.id);
  return `${["mode: static", ...staticSteps.map((step) => formatLiveTraceLine(params.store, step, params.projectRoot))].join("\n")}\n`;
}
```
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-stale.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 9: Wire the trace tool into the extension [depends: 8]

### Task 9: Wire the trace tool into the extension [depends: 8]
- Modify: `src/index.ts`
- Modify: `test/extension-wiring.test.ts`
**ACs covered:** 19 (wiring only; behavior ACs covered in prior tasks)

**Step 1 — Write the failing test**
`test/extension-wiring.test.ts` (append this test)
```ts
import { expect, test } from "bun:test";

test("pi extension registers trace tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((t) => t.name === "trace");
  expect(traceTool).toBeDefined();

  const schema = traceTool!.parameters as any;
  expect(schema.properties.entry).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("entry");
  expect(schema.required).not.toContain("file");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` for missing trace registration

**Step 3 — Write minimal implementation**
`src/index.ts` — make targeted edits to the current file:

Add the import near existing tool imports:
```ts
import { trace } from "./tools/trace.js";
```

Add the schema near the existing param schemas:
```ts
const TraceParams = Type.Object({
  entry: Type.String({ description: "Entry symbol or endpoint name" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});
```

Append a registration alongside the existing tool registrations, preserving the current execute return shape:
```ts
pi.registerTool({
  name: "trace",
  label: "Trace",
  description: "Return one deterministic anchored execution path for a test, symbol, or endpoint",
  parameters: TraceParams,
  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const projectRoot = ctx.cwd;
    const store = getOrCreateStore(projectRoot);
    await ensureIndexed(projectRoot, store);
    const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
    return { content: [{ type: "text", text }], details: undefined };
  },
});
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
