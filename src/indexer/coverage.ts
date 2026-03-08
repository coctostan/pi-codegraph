import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphStore, TestTraceRecord } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";

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
  const fileContentCache = new Map<string, string>();

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

        const content = fileContentCache.get(filePath) ?? readFileSync(filePath, "utf8");
        fileContentCache.set(filePath, content);
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
            endLine: countLineAtOffset(content, firstCoveredRange.endOffset),
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
      .filter((record) => record.node.kind === "test" || record.file.endsWith(".test.ts") || record.file.endsWith(".spec.ts"))
      .sort((a, b) => a.node.id.localeCompare(b.node.id));
    const production = group
      .filter((record) => record.node.kind !== "test" && !record.file.endsWith(".test.ts") && !record.file.endsWith(".spec.ts"))
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
          created_at: Date.now(),
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
