import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { SCHEMA_VERSION } from "../graph/sqlite.js";
import type { FailedLookup, GraphStore } from "../graph/store.js";
import { calledName, type GraphEdge, type GraphNode } from "../graph/types.js";
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
  /** True when the result names a node and no coverage report was indexed, so no line carries a coverage tag. */
  coverageUnknown: boolean;
  /** Files of the result's nodes that tree-sitter parsed with errors, the targets' files first. */
  partialFiles: string[];
  /** The result's rendered calls, and calls named after a target, whose last tsserver lookup timed out or errored. */
  failedLookups: number;
  /** The targets' `symbol_graph` lookups whose last ask timed out or errored, as `callers of b`. */
  failedResolves: string[];
  /** What the last index run couldn't read, extract, remove or write, as `src/c.ts` or `lsp stage`: any result can miss it. */
  indexErrors: string[];
  /** The index's `schema_version` when a newer codegraph wrote it, so no row is this code's to trust; else null. */
  newerIndexVersion: number | null;
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

function partialFiles(store: GraphStore, targets: GraphNode[], touched: GraphNode[]): string[] {
  const partial = new Set(store.queryRows<{ file: string }>("SELECT file FROM file_hashes WHERE partial = 1").map((row) => row.file));
  const pick = (nodes: GraphNode[], skip: string[] = []) =>
    sortedStrings(new Set(nodes.map((node) => node.file).filter((file) => partial.has(file) && !skip.includes(file))));
  const targetFiles = pick(targets);
  return [...targetFiles, ...pick(touched, targetFiles)];
}

function failedCalls(failures: FailedLookup[], targets: GraphNode[], edges: GraphEdge[]): number {
  const rendered = new Set(edges.map((edge) => `${edge.source}\0${edge.provenance.evidence}`));
  const targetNames = new Set(targets.map(calledName));
  // A call's evidence is `<callee>:<line>:<col>`, so a call to a target stays countable while it reads unresolved.
  return failures
    .filter((f) => f.kind === "definition")
    .filter((f) => rendered.has(`${f.source}\0${f.evidence}`) || targetNames.has(f.evidence.split(":")[0]!)).length;
}

function failedResolves(failures: FailedLookup[], targets: GraphNode[]): string[] {
  return targets.flatMap((node) =>
    ([["references", "callers"], ["implementations", "implementations"]] as const)
      .filter(([kind]) => failures.some((f) => f.kind === kind && f.source === node.id))
      .map(([, label]) => `${label} of ${node.name}`),
  );
}

/** A file's current hash, null when it can't be read: the index run that couldn't read it names it. */
function hashOf(fullPath: string): string | null {
  try {
    return sha256Hex(readFileSync(fullPath, "utf8"));
  } catch {
    return null;
  }
}

/** The store's `schema_version` when a newer codegraph wrote it, else null, unread included. */
export function newerIndexVersion(store: GraphStore): number | null {
  try {
    const version = store.queryRows<{ version: number }>("SELECT version FROM schema_version LIMIT 1")[0]?.version;
    return version !== undefined && version > SCHEMA_VERSION ? version : null;
  } catch {
    return null;
  }
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

  const currentHash = hashOf(fullPath);
  if (currentHash === null) {
    report.localStale = true;
    return;
  }
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

  const currentHash = hashOf(fullPath);
  if (currentHash === null) {
    report.localStale = true;
    return;
  }
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
  const failures = params.store.getFailedLookups();
  const failed = failedCalls(failures, params.targetNodes ?? [], params.resultEdges ?? []);
  const resolves = failedResolves(failures, params.targetNodes ?? []);
  const indexErrors = [...new Set(failures.filter((f) => f.kind === "index").map((f) => f.source))];
  if (failed > 0 || resolves.length > 0 || indexErrors.length > 0) report.localStale = true;
  const newerVersion = newerIndexVersion(params.store);

  const status: FreshnessStatus = newerVersion !== null
    ? "stale"
    : report.unknown
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
    coverageUnknown: nodesById.size > 0 && !params.store.hasCoverageData(),
    partialFiles: partialFiles(params.store, params.targetNodes ?? [], [...nodesById.values()]),
    failedLookups: failed,
    failedResolves: resolves,
    indexErrors,
    newerIndexVersion: newerVersion,
    message,
    recommendation: newerVersion !== null ? "restart pi to load the newer codegraph that wrote this index" : params.recommendation,
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
  const notes = [
    report.partialFiles.length > 0 ? `- partially parsed: ${report.partialFiles.join(", ")}` : null,
    report.coverageUnknown ? "- coverage: unknown, no coverage report indexed" : null,
  ].filter((note): note is string => note !== null);
  if (report.status === "fresh") return ["Trust: fresh", ...notes].join("\n");
  const lines = [`Trust: ${report.status}`];
  if (report.newerIndexVersion !== null) {
    lines.push(`- index version: ${report.newerIndexVersion}, written by a newer codegraph than this one (${SCHEMA_VERSION})`);
  }
  const changed = formatFiles("changed files", report.changedFiles);
  const deleted = formatFiles("deleted files", report.deletedFiles);
  if (changed) lines.push(changed);
  if (deleted) lines.push(deleted);
  if (report.affectedSymbols.length > 0) lines.push(`- affected symbols: ${report.affectedSymbols.join(", ")}`);
  if (report.staleEdgeCount > 0) lines.push(`- stale edges: ${report.staleEdgeCount}`);
  const failedNotes = [
    ...(report.failedLookups > 0 ? [`${report.failedLookups} ${report.failedLookups === 1 ? "call" : "calls"}`] : []),
    ...report.failedResolves,
  ];
  if (failedNotes.length > 0) lines.push(`- lookups failed: ${failedNotes.join(", ")} (tsserver timed out or errored)`);
  const indexErrors = report.indexErrors.slice(0, 5);
  if (report.indexErrors.length > 5) indexErrors.push(`+${report.indexErrors.length - 5} more`);
  if (indexErrors.length > 0) lines.push(`- index errors: ${indexErrors.join(", ")}`);
  lines.push(...notes);
  lines.push(`- recommendation: ${report.recommendation ?? "refresh index before relying on this result"}`);
  return lines.join("\n");
}

export function prependFreshnessHeader(body: string, report: FreshnessReport): string {
  return `${formatFreshnessHeader(report)}\n${body}`;
}
