import type { GraphStore, NeighborResult } from "../graph/store.js";
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  type AnchoredNeighbor,
  type NeighborSection,
  type NamedSection,
} from "../output/anchoring.js";
import { createSignalComputer, type NodeSignals } from "../output/signals.js";
import { prependTrustHeader } from "../output/trust.js";
import { renderSymbolCardBody, renderSymbolSourceSection } from "./symbol-card.js";
import { renderSymbolContractBody } from "./symbol-contract.js";

export interface SymbolGraphParams {
  name: string;
  file?: string;
  include?: Array<"neighborhood" | "contract" | "source">;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}

export interface RenderedSymbolNeighborhood {
  body: string;
  hasLocalExceptions: boolean;
}

function isAgentEdgeStale(nr: NeighborResult, store: GraphStore): boolean {
  if (nr.edge.provenance.source !== "agent") return false;
  const sourceNode = store.getNode(nr.edge.source);
  if (!sourceNode) return true;
  const currentFileHash = store.getFileHash(sourceNode.file);
  if (!currentFileHash) return true;
  return nr.edge.provenance.content_hash !== currentFileHash;
}

function toAnchoredNeighbor(
  nr: NeighborResult,
  projectRoot: string,
  store: GraphStore,
  computeSignals?: (nodeId: string) => NodeSignals,
): AnchoredNeighbor {
  const anchor = computeAnchor(nr.node, projectRoot);
  const agentStale = isAgentEdgeStale(nr, store);
  const effectiveAnchor = agentStale ? { ...anchor, stale: true } : anchor;
  return {
    anchor: effectiveAnchor,
    name: nr.node.name,
    edgeKind: nr.edge.kind,
    confidence: nr.edge.provenance.confidence,
    provenanceSource: nr.edge.provenance.source,
    signals: computeSignals ? computeSignals(nr.node.id) : undefined,
  };
}

function buildSection(
  neighbors: NeighborResult[],
  limit: number,
  projectRoot: string,
  store: GraphStore,
  computeSignals?: (nodeId: string) => NodeSignals,
): NeighborSection {
  const ranked = rankNeighbors(neighbors, limit);
  return {
    items: ranked.kept.map((nr) => toAnchoredNeighbor(nr, projectRoot, store, computeSignals)),
    omitted: ranked.omitted,
  };
}

function hasStaleItems(section: NeighborSection): boolean {
  return section.items.some((item) => item.anchor.stale);
}

/** Map (edgeKind, direction) to a human-readable section title. */
function sectionTitle(edgeKind: string, direction: "in" | "out"): string {
  switch (edgeKind) {
    case "calls":
      return direction === "in" ? "Callers" : "Callees";
    case "imports":
      return direction === "in" ? "Imported By" : "Imports";
    case "implements":
      return direction === "in" ? "Implemented By" : "Implements";
    case "extends":
      return direction === "in" ? "Extended By" : "Extends";
    case "tested_by":
      return direction === "in" ? "Tested By" : "Tests";
    case "co_changes_with":
      return "Co-changes With";
    case "renders":
      return direction === "in" ? "Rendered By" : "Renders";
    case "routes_to":
      return direction === "in" ? "Routed From" : "Routes To";
    default: {
      const label = edgeKind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return direction === "in" ? `${label} (incoming)` : `${label} (outgoing)`;
    }
  }
}

export function renderLegacyNeighborhoodBody(params: SymbolGraphParams): RenderedSymbolNeighborhood {
  const { name, file, limit = 10, store, projectRoot } = params;
  const nodes = store.findNodes(name, file);
  if (nodes.length === 0) {
    return { body: `Symbol "${name}" not found`, hasLocalExceptions: false };
  }
  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    return {
      body: `${lines.join("\n")}\n`,
      hasLocalExceptions: lines.some((line) => line.includes("[stale]")),
    };
  }
    const node = nodes[0]!;
  const symbolAnchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const allNeighbors = store.getNeighbors(node.id);
    const computeSignals = (nodeId: string) => signalComputer.compute(nodeId);
  const buckets = new Map<string, NeighborResult[]>();
    const unresolvedResults: NeighborResult[] = [];
  for (const nr of allNeighbors) {
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
    const namedSections: NamedSection[] = [];
  for (const title of sectionOrder) {
    const bucket = buckets.get(title);
    if (bucket && bucket.length > 0) {
      namedSections.push({ title, section: buildSection(bucket, limit, projectRoot, store, computeSignals) });
      buckets.delete(title);
    }
  }
    for (const [title, bucket] of buckets) {
    if (bucket.length > 0) {
      namedSections.push({ title, section: buildSection(bucket, limit, projectRoot, store, computeSignals) });
    }
  }
    if (unresolvedResults.length > 0) {
    namedSections.push({ title: "Unresolved", section: buildSection(unresolvedResults, limit, projectRoot, store) });
  }
  return {
    body: formatNeighborhood(
      { name: node.name, kind: node.kind, anchor: symbolAnchor, signals: signalComputer.compute(node.id) },
      namedSections,
    ),
    hasLocalExceptions: symbolAnchor.stale || namedSections.some((ns) => hasStaleItems(ns.section)),
  };
}
export function symbolGraph(params: SymbolGraphParams): string {
  const { include } = params;
  const stats = params.store.getStatistics(params.projectRoot);
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
  let hasLocalExceptions = base.hasLocalExceptions;
  if (resolvedNodes.length === 1 && (include ?? []).includes("contract")) {
    const renderedContract = renderSymbolContractBody({
      name: params.name,
      file: params.file,
      store: params.store,
      projectRoot: params.projectRoot,
    });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${renderedContract.body}`;
    hasLocalExceptions = hasLocalExceptions || renderedContract.hasLocalExceptions;
  }

  if (resolvedNodes.length === 1 && (include ?? []).includes("source")) {
    const renderedSource = renderSymbolSourceSection({
      name: params.name,
      file: params.file,
      store: params.store,
      projectRoot: params.projectRoot,
    });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${renderedSource.body}`;
    hasLocalExceptions = hasLocalExceptions || renderedSource.hasLocalExceptions;
  }
  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
