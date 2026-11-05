import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { GraphStore } from "../graph/store.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { nodeId } from "../graph/types.js";
import { extractFunctionAt, type FunctionAt } from "../indexer/tree-sitter.js";
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
import { createSignalComputer, formatRoleTags, type NodeRole, type SignalComputer } from "../output/signals.js";
import { resolveUniqueSymbol, type SymbolResolution } from "./symbol-resolution.js";

export interface TraceParams {
  entry?: string;
  file?: string;
  /** With `file`, start at the innermost function holding this 1-based line instead of looking `entry` up. */
  line?: number;
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
const STATIC_TRACE_DEPTH = 3;
const UNRESOLVED = "__unresolved__::";

type CallEnd = GraphEdge["call_end"];

/** A caller's callee: a resolved node, or an unresolved call's edge and its rendered `? <name> (unresolved, <file>:<line>)` line. */
interface Callee {
  node?: GraphNode;
  unresolved?: { edge: GraphEdge; line: string };
  end: CallEnd;
  file: string;
  line: number;
}

function endsBefore(a: CallEnd, b: CallEnd): boolean {
  return !!a && (!b || a.line < b.line || (a.line === b.line && a.col < b.col));
}

const unresolvedName = (edge: GraphEdge) => edge.target.slice(UNRESOLVED.length, edge.target.lastIndexOf(":"));

/** An unresolved call's callee, printed at `at`'s call: `edge` itself unless a stored edge stands for a call it read. */
function unresolvedCallee(edge: GraphEdge, file: string, at: GraphEdge = edge): Callee {
  // Tree-sitter's evidence is `<callee>:<line>:<col>`, the callee's start.
  const evidenceLine = Number(at.provenance.evidence.split(":").at(-2));
  const line = Number.isInteger(evidenceLine) ? evidenceLine : (at.call_end?.line ?? 0);
  return { unresolved: { edge, line: `? ${unresolvedName(edge)} (unresolved, ${file}:${line})` }, end: at.call_end, file, line };
}

const byCallOrder = (a: Callee, b: Callee): number =>
  (endsBefore(a.end, b.end) ? -1 : endsBefore(b.end, a.end) ? 1 : 0) ||
  a.file.localeCompare(b.file) ||
  a.line - b.line ||
  (a.node?.id ?? a.unresolved!.line).localeCompare(b.node?.id ?? b.unresolved!.line);

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
    .map((edge) => unresolvedCallee(edge, caller.file));
  return [...byId.values(), ...unresolved].sort(byCallOrder);
}

interface StaticTrace {
  lines: Array<{ line: string; stale: boolean }>;
  /** Each node printed in full, in print order. */
  nodeIds: string[];
  /** Each unresolved call printed, for the freshness check. */
  unresolvedEdges: GraphEdge[];
}

/**
 * The call tree below `entry`: each node printed once, a repeat as a reference, and a count of the callees cut at the depth cap.
 * `entryCallees`, when given, stand for the entry's own, for an entry the graph holds no node for.
 */
function buildStaticTrace(
  store: GraphStore,
  entry: GraphNode,
  projectRoot: string,
  signalComputer: SignalComputer,
  entryCallees?: Callee[],
): StaticTrace {
  const printed = new Set<string>();
  const lines: StaticTrace["lines"] = [];
  const cut: GraphNode[] = [];
  const unresolvedEdges: GraphEdge[] = [];
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
    for (const callee of depth === 0 && entryCallees ? entryCallees : orderedCallees(store, node)) {
      if (callee.node) visit(callee.node, depth + 1);
      else {
        lines.push({ line: `${indent}  ${callee.unresolved!.line}`, stale: false });
        unresolvedEdges.push(callee.unresolved!.edge);
      }
    }
  };
  visit(entry, 0);

  // Every callee reachable past the cap that the tree never printed: a node once, an unresolved call once per caller.
  const omitted = new Set<string>();
  while (cut.length > 0) {
    const node = cut.pop()!;
    for (const callee of orderedCallees(store, node)) {
      const key = callee.node?.id ?? `${node.id}\0${callee.unresolved!.line}`;
      if (printed.has(key) || omitted.has(key)) continue;
      omitted.add(key);
      if (callee.node) cut.push(callee.node);
    }
  }
  if (omitted.size > 0) lines.push({ line: `${omitted.size} more omitted beyond depth ${STATIC_TRACE_DEPTH}`, stale: false });
  return { lines, nodeIds: [...printed], unresolvedEdges };
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
    line: `${formatAnchorLocation(anchor)}  ${node.name}${node.kind === "function" ? "" : `  ${node.kind}`}${anchor.stale ? " [stale]" : ""}${tags ? ` ${tags}` : ""}`,
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
  const base = mode === "coverage"
    ? "mode: coverage (the test, then every function its report covered, by file and line, not call order)"
    : "mode: static (heuristic, no runtime evidence)";
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

type EntryParams = TraceParams & { entry: string };

const traceMiss = (params: TraceParams, text: string) => ({
  text: prependFreshnessHeader(
    text,
    evaluateFreshness({
      store: params.store,
      projectRoot: params.projectRoot,
      recommendation: "trace path may be unreliable; refresh index before relying on this result",
    }),
  ),
  resolved: false,
});

/** The rendered trace plus whether `entry` (scoped by `file`), or `file` + `line`, resolved to exactly one starting point. */
export function traceResult(params: TraceParams): { text: string; resolved: boolean } {
  if (params.line !== undefined) {
    if (!params.file) return traceMiss(params, "`line` needs `file`\n");
    return traceAtLine(params, params.file, params.line);
  }
  if (!params.entry) return traceMiss(params, "trace needs `entry`, or `file` with `line`\n");
  const resolved = resolveUniqueSymbol({
    name: params.entry,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
    notFoundLabel: "Symbol",
  });
  return { text: renderTrace({ ...params, entry: params.entry }, resolved), resolved: resolved.kind === "unique" };
}

/** The trace from the innermost function holding `line`: its node's when the graph holds one, else its own calls'. */
function traceAtLine(params: TraceParams, file: string, line: number): { text: string; resolved: boolean } {
  let content: string;
  try {
    content = readFileSync(join(params.projectRoot, file), "utf8");
  } catch {
    return traceMiss(params, `File ${file} could not be read\n`);
  }
  const at = extractFunctionAt(file, content, line);
  if (at.kind === "none") return traceMiss(params, `No function holds line ${line} of ${file}\n`);
  if (at.kind === "several") {
    const fns = at.fns.map((f) => `  ${f.name} (${file}:${f.line}:${f.column})`);
    return traceMiss(params, [`Several functions hold line ${line} of ${file}, side by side:`, "", ...fns, ""].join("\n"));
  }
  const fn = at.fn;
  const owner = fn.ownerId ? (params.store.getNode(fn.ownerId) ?? null) : null;
  if (fn.own && owner) return { text: renderTrace({ ...params, entry: owner.name }, { kind: "unique", node: owner }), resolved: true };
  return { text: renderSpanTrace(params, file, fn, owner), resolved: true };
}

/**
 * A function the graph holds no node for, an object method or a callback: its calls, read from the file now, each
 * resolved as its owner's stored call to that name resolves; a name the owner's stored calls lack prints unresolved.
 */
function renderSpanTrace(params: TraceParams, file: string, fn: FunctionAt, owner: GraphNode | null): string {
  const { store } = params;
  const hashOf = owner ?? store.getNode(nodeId(file, file, 1));
  const entry: GraphNode = {
    id: nodeId(file, fn.name, fn.startLine),
    kind: "function",
    name: owner ? `${fn.name} (in ${owner.name})` : fn.name,
    file,
    start_line: fn.startLine,
    end_line: fn.startLine,
    content_hash: hashOf?.content_hash ?? "",
    is_exported: false,
  };
  const ownerCalls = owner ? store.getNeighbors(owner.id, { direction: "out", kind: "calls" }) : [];
  const ownerUnresolved = owner ? store.getEdgesBySource(owner.id).filter((e) => e.kind === "calls" && e.target.startsWith(UNRESOLVED)) : [];
  const resolvedEdges: GraphEdge[] = [];
  const unindexed: string[] = [];
  const callees = fn.calls
    .map((call): Callee => {
      const name = unresolvedName(call);
      const hit = ownerCalls.find((n) => n.node.name === name);
      if (hit) {
        resolvedEdges.push(hit.edge);
        return { node: hit.node, end: call.call_end, file: hit.node.file, line: hit.node.start_line };
      }
      const stored = ownerUnresolved.find((e) => unresolvedName(e) === name);
      if (!stored) unindexed.push(`${file}:${name}`);
      return unresolvedCallee(stored ?? call, file, call);
    })
    .sort(byCallOrder);
  return renderStatic(params, entry, owner, { callees, edges: resolvedEdges, unindexed });
}

function renderTrace(params: EntryParams, resolved: SymbolResolution): string {
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

  return renderStatic(params, node, node);
}

/**
 * The static tree below `entry`, judged fresh against `target`. A `span` entry has no node: its callees, the stored edges
 * they resolved by, and each call the index holds no edge for.
 */
function renderStatic(
  params: TraceParams,
  entry: GraphNode,
  target: GraphNode | null,
  span?: { callees: Callee[]; edges: GraphEdge[]; unindexed: string[] },
): string {
  const staticTrace = buildStaticTrace(params.store, entry, params.projectRoot, createSignalComputer(params.store), span?.callees);
  const staticEdges = [
    ...collectStaticTraceEdges(params.store, staticTrace.nodeIds),
    ...(span?.edges ?? []),
    // A span's unindexed call has no stored edge to judge; `unindexed` names it instead.
    ...staticTrace.unresolvedEdges.filter((edge) => !span || edge.source !== entry.id),
  ];
  const freshness = traceFreshness(params, target, staticTrace.nodeIds, span?.unindexed ?? [], staticEdges);
  const staticStale = staticTrace.lines.some((step) => step.stale) || freshness.status !== "fresh";
  const body = `${[formatModeHeader("static", staticStale), ...staticTrace.lines.map((step) => step.line)].join("\n")}\n`;
  return prependFreshnessHeader(body, freshness);
}
