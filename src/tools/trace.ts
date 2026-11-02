import type { GraphStore } from "../graph/store.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
import { createSignalComputer, formatRoleTags, type NodeRole, type SignalComputer } from "../output/signals.js";
import { resolveUniqueSymbol, type SymbolResolution } from "./symbol-resolution.js";

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

/** A static trace prints callees down to this many calls below its entry. */
const STATIC_TRACE_DEPTH = 4;
const UNRESOLVED = "__unresolved__::";

type CallEnd = GraphEdge["call_end"];

/** A caller's callee: a resolved node, or an unresolved call's rendered `? <name> (unresolved, <file>:<line>)` line. */
interface Callee {
  node?: GraphNode;
  unresolved?: string;
  end: CallEnd;
  file: string;
  line: number;
}

function endsBefore(a: CallEnd, b: CallEnd): boolean {
  return !!a && (!b || a.line < b.line || (a.line === b.line && a.col < b.col));
}

/** `caller`'s callees in the order their calls end, the first call to end placing a callee; one without a call end last. */
function orderedCallees(store: GraphStore, caller: GraphNode): Callee[] {
  const byId = new Map<string, Callee>();
  for (const { node, edge } of store.getNeighbors(caller.id, { direction: "out", kind: "calls" })) {
    const kept = byId.get(node.id);
    if (!kept || endsBefore(edge.call_end, kept.end)) byId.set(node.id, { node, end: edge.call_end, file: node.file, line: node.start_line });
  }
  const unresolved = store
    .getEdgesBySource(caller.id)
    .filter((edge) => edge.kind === "calls" && edge.target.startsWith(UNRESOLVED))
    .map((edge): Callee => {
      const name = edge.target.slice(UNRESOLVED.length, edge.target.lastIndexOf(":"));
      // Tree-sitter's evidence is `<callee>:<line>:<col>`, the callee's start.
      const evidenceLine = Number(edge.provenance.evidence.split(":").at(-2));
      const line = Number.isInteger(evidenceLine) ? evidenceLine : (edge.call_end?.line ?? 0);
      return { unresolved: `? ${name} (unresolved, ${caller.file}:${line})`, end: edge.call_end, file: caller.file, line };
    });
  return [...byId.values(), ...unresolved].sort(
    (a, b) =>
      (endsBefore(a.end, b.end) ? -1 : endsBefore(b.end, a.end) ? 1 : 0) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      (a.node?.id ?? a.unresolved!).localeCompare(b.node?.id ?? b.unresolved!),
  );
}

interface StaticTrace {
  lines: Array<{ line: string; stale: boolean }>;
  /** Each node printed in full, in print order. */
  nodeIds: string[];
}

/** The call tree below `entry`: each node printed once, a repeat as a reference, and a count of the callees cut at the depth cap. */
function buildStaticTrace(store: GraphStore, entry: GraphNode, projectRoot: string, signalComputer: SignalComputer): StaticTrace {
  const printed = new Set<string>();
  const lines: StaticTrace["lines"] = [];
  const cut: GraphNode[] = [];
  const visit = (node: GraphNode, depth: number): void => {
    const indent = "  ".repeat(depth);
    if (printed.has(node.id)) {
      lines.push({ line: `${indent}${node.name} (see above)`, stale: false });
      return;
    }
    printed.add(node.id);
    const step = formatNodeLine(node, projectRoot, signalComputer);
    lines.push({ line: `${indent}${step.line}`, stale: step.stale });
    if (depth === STATIC_TRACE_DEPTH) {
      cut.push(node);
      return;
    }
    for (const callee of orderedCallees(store, node)) {
      if (callee.node) visit(callee.node, depth + 1);
      else lines.push({ line: `${indent}  ${callee.unresolved}`, stale: false });
    }
  };
  visit(entry, 0);

  // Every callee reachable past the cap that the tree never printed: a node once, an unresolved call once per caller.
  const omitted = new Set<string>();
  while (cut.length > 0) {
    const node = cut.pop()!;
    for (const callee of orderedCallees(store, node)) {
      const key = callee.node?.id ?? `${node.id}\0${callee.unresolved}`;
      if (printed.has(key) || omitted.has(key)) continue;
      omitted.add(key);
      if (callee.node) cut.push(callee.node);
    }
  }
  if (omitted.size > 0) lines.push({ line: `${omitted.size} more omitted beyond depth ${STATIC_TRACE_DEPTH}`, stale: false });
  return { lines, nodeIds: [...printed] };
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
    line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""}${tags ? ` ${tags}` : ""}`,
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
    line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}${tags ? ` ${tags}` : ""}`,
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

/** The rendered trace plus whether `entry` (scoped by `file`) resolved to exactly one node. */
export function traceResult(params: TraceParams): { text: string; resolved: boolean } {
  const resolved = resolveUniqueSymbol({
    name: params.entry,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
    notFoundLabel: "Symbol",
  });
  return { text: renderTrace(params, resolved), resolved: resolved.kind === "unique" };
}

function renderTrace(params: TraceParams, resolved: SymbolResolution): string {
  const emptyFreshness = evaluateFreshness({
    store: params.store,
    projectRoot: params.projectRoot,
    recommendation: "trace path may be unreliable; refresh index before relying on this result",
  });

  if (resolved.kind === "ambiguous") {
    return prependFreshnessHeader(resolved.text, traceFreshness(params, null, resolved.nodes.map((n) => n.id)));
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

  const staticTrace = buildStaticTrace(params.store, node, params.projectRoot, signalComputer);
  const staticEdges = collectStaticTraceEdges(params.store, staticTrace.nodeIds);
  const freshness = traceFreshness(params, node, staticTrace.nodeIds, [], staticEdges);
  const staticStale = staticTrace.lines.some((step) => step.stale) || freshness.status !== "fresh";
  const body = `${[formatModeHeader("static", staticStale), ...staticTrace.lines.map((step) => step.line)].join("\n")}\n`;
  return prependFreshnessHeader(body, freshness);
}
