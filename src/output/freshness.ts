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
