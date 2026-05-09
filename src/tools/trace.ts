import type { GraphStore } from "../graph/store.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
import { createSignalComputer, formatRoleTags, type NodeRole, type SignalComputer } from "../output/signals.js";
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
  const stack: string[] = [startNodeId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    ordered.push(currentId);
    const nextNeighbors = store.getNeighbors(currentId, { direction: "out", kind: "calls" });
    const sorted = nextNeighbors.sort((a, b) =>
      a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || a.node.id.localeCompare(b.node.id)
    );
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!seen.has(sorted[i].node.id)) {
        stack.push(sorted[i].node.id);
      }
    }
  }
  return ordered;
}

function formatStoredTraceLine(
  store: GraphStore,
  nodeId: string,
  storedHash: string,
  projectRoot: string,
  signalComputer: SignalComputer,
): { line: string; stale: boolean } {
  const node = store.getNode(nodeId);
  if (!node) {
    return { line: `${nodeId}  unresolved [stale]`, stale: true };
  }
  const anchor = computeAnchor(node, projectRoot);
  const stale = anchor.stale || node.content_hash !== storedHash;
  const tags = formatRoleTags(signalComputer.compute(node.id));
  return {
    line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""} ${tags}`,
    stale,
  };
}

function formatNodeLine(
  node: GraphNode,
  projectRoot: string,
  signalComputer: SignalComputer,
  rolesOverride?: NodeRole[],
): { line: string; stale: boolean } {
  const anchor = computeAnchor(node, projectRoot);
  const signals = signalComputer.compute(node.id);
  const tags = formatRoleTags({ ...signals, roles: rolesOverride ?? signals.roles });
  return {
    line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""} ${tags}`,
    stale: anchor.stale,
  };
}

function formatLiveTraceLine(
  store: GraphStore,
  nodeId: string,
  projectRoot: string,
  signalComputer: SignalComputer,
  rolesOverride?: NodeRole[],
): { line: string; stale: boolean } {
  const node = store.getNode(nodeId);
  if (!node) return { line: `${nodeId}  unresolved [stale]`, stale: true };
  return formatNodeLine(node, projectRoot, signalComputer, rolesOverride);
}

function formatFileScopedMiss(name: string, requestedFile: string, nodes: GraphNode[], projectRoot: string): string {
  const sorted = [...nodes].sort((a, b) =>
    a.file.localeCompare(b.file) || a.start_line - b.start_line || a.id.localeCompare(b.id)
  );
  const lines: string[] = [`Symbol "${name}" was not found in ${requestedFile}. Matches exist in other files:`, ""];
  for (const node of sorted) {
    const anchor = computeAnchor(node, projectRoot);
    const staleMarker = anchor.stale ? " [stale]" : "";
    lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
  }
  return `${lines.join("\n")}\n`;
}

function formatModeHeader(mode: "coverage" | "static", stale = false): string {
  const base = mode === "coverage" ? "mode: coverage" : "mode: static (heuristic, no runtime evidence)";
  return `${base}${stale ? " [stale]" : ""}`;
}

function traceFreshness(
  params: TraceParams,
  targetNode: GraphNode | null,
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
    targetNodes: targetNode ? [targetNode] : [],
    resultNodes: targetNode ? [targetNode, ...resultNodes] : resultNodes,
    resultEdges,
    unresolvedItems,
    recommendation: "trace path may be unreliable; refresh index before relying on this result",
  });
}

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
      const freshness = traceFreshness(params, null, orderedSteps.map((step) => step.nodeId), unresolvedItems);
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
  const staticEdges = collectStaticTraceEdges(params.store, staticNodeIds);
  const freshness = traceFreshness(params, node, staticNodeIds, [], staticEdges);
  const staticStale = staticSteps.some((step) => step.stale) || freshness.status !== "fresh";
  const body = `${[formatModeHeader("static", staticStale), ...staticSteps.map((step) => step.line)].join("\n")}\n`;
  return prependFreshnessHeader(body, freshness);
}
