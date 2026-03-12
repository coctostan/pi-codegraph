import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";

export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
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
    const nextNeighbors = store.getNeighbors(currentId, { direction: "out", kind: "calls" });
    const next = nextNeighbors
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

function formatModeHeader(mode: "coverage" | "static", stale = false): string {
  const base = mode === "coverage"
    ? "mode: coverage"
    : "mode: static (heuristic, no runtime evidence)";
  return `${base}${stale ? " [stale]" : ""}`;
}

export function trace(params: TraceParams): string {
  const resolved = resolveUniqueSymbol({
    name: params.entry,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
    notFoundLabel: "Entry",
  });
  if (resolved.kind === "not_found" || resolved.kind === "ambiguous") return resolved.text;

  const node = resolved.node;
  const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const rendered = coverage.steps.sort((a, b) => a.ordinal - b.ordinal).map((step) => formatStoredTraceLine(params.store, step.nodeId, step.contentHash, params.projectRoot));
      const traceStale = rendered.some((item) => item.stale);
      return `${[formatModeHeader("coverage", traceStale), ...rendered.map((item) => item.line)].join("\n")}\n`;
    }
  }

  const staticSteps = buildStaticTrace(params.store, node.id);
  return `${[formatModeHeader("static"), ...staticSteps.map((step) => formatLiveTraceLine(params.store, step, params.projectRoot))].join("\n")}\n`;
}
