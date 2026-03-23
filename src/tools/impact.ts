import type { GraphStore, NeighborResult } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatImpactWhy, type NodeSignals, type SignalComputer } from "../output/signals.js";
import { prependTrustHeader } from "../output/trust.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";

export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";

export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
  signalComputer?: SignalComputer;
}
export interface ImpactItem {
  nodeId: string;
  name: string;
  file: string;
  depth: number;
  classification: ImpactClassification;
}

export interface ImpactDetail extends ImpactItem {
  chainConfidence: number;
  signals: NodeSignals;
}

interface QueueItem {
  id: string;
  depth: number;
  chainConfidence: number;
}

function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
  if (changeType === "addition") return null;
  if (changeType === "behavior_change") return "behavioral";
  if (changeType === "signature_change" || changeType === "removal") {
    return depth === 1 ? "breaking" : "behavioral";
  }
  return null;
}

function dedupeInboundByStrongestEdge(inbound: NeighborResult[]): NeighborResult[] {
  const bestByNode = new Map<string, NeighborResult>();
  for (const hit of inbound) {
    const existing = bestByNode.get(hit.node.id);
    if (!existing || hit.edge.provenance.confidence > existing.edge.provenance.confidence) {
      bestByNode.set(hit.node.id, hit);
    }
  }
  return [...bestByNode.values()];
}

function compareDetails(a: ImpactDetail, b: ImpactDetail): number {
  if (a.classification !== b.classification) return a.classification === "breaking" ? -1 : 1;
  if (a.signals.fanIn !== b.signals.fanIn) return b.signals.fanIn - a.signals.fanIn;
  if (a.signals.tested !== b.signals.tested) return a.signals.tested ? 1 : -1;
  if (a.signals.coChangeScore !== b.signals.coChangeScore) return b.signals.coChangeScore - a.signals.coChangeScore;
  if (a.chainConfidence !== b.chainConfidence) return b.chainConfidence - a.chainConfidence;
  if (a.depth !== b.depth) return a.depth - b.depth;
  return a.file.localeCompare(b.file) || a.name.localeCompare(b.name);
}

export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[] {
  const { symbols, changeType, store, maxDepth = 5, signalComputer: providedSignalComputer } = params;
  if (changeType === "addition") return [];

  const queue: QueueItem[] = [];
  const seen = new Map<string, { depth: number; chainConfidence: number }>();
  const detailsByNode = new Map<string, ImpactDetail>();

  const changedNodeIds: string[] = [];
  for (const symbol of symbols) {
    for (const node of store.findNodes(symbol)) {
      queue.push({ id: node.id, depth: 0, chainConfidence: 1 });
      seen.set(node.id, { depth: 0, chainConfidence: 1 });
      changedNodeIds.push(node.id);
    }
  }

  const signalComputer = providedSignalComputer ?? createSignalComputer(store);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inbound = dedupeInboundByStrongestEdge(store.getNeighbors(current.id, { direction: "in", kind: "calls" }));

    for (const neighbor of inbound) {
      const depth = current.depth + 1;
      const chainConfidence = Math.min(current.chainConfidence, neighbor.edge.provenance.confidence);
      const existing = seen.get(neighbor.node.id);

      if (existing && (existing.depth < depth || (existing.depth === depth && existing.chainConfidence >= chainConfidence))) {
        continue;
      }

      seen.set(neighbor.node.id, { depth, chainConfidence });
      queue.push({ id: neighbor.node.id, depth, chainConfidence });

      const classification = classify(changeType, depth);
      if (!classification) continue;

      detailsByNode.set(neighbor.node.id, {
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
        chainConfidence,
        signals: signalComputer.compute(neighbor.node.id, changedNodeIds),
      });
    }
  }

  return [...detailsByNode.values()].sort(compareDetails);
}

export function collectImpact(params: CollectImpactParams): ImpactItem[] {
  return collectImpactDetails(params).map(({ nodeId, name, file, depth, classification }) => ({
    nodeId,
    name,
    file,
    depth,
    classification,
  }));
}

export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  const stats = params.store.getStatistics(params.projectRoot);

  for (const symbol of params.symbols) {
    const resolved = resolveUniqueSymbol({
      name: symbol,
      store: params.store,
      projectRoot: params.projectRoot,
      notFoundLabel: "Symbol",
    });
    if (resolved.kind === "ambiguous") return prependTrustHeader(resolved.text, { stats });
    if (resolved.kind === "not_found") return prependTrustHeader(resolved.text, { stats });
  }

  if (params.changeType === "addition") {
    return prependTrustHeader(
      `addition: impact analysis for additions is not yet supported \u2014 use symbol_graph to inspect the new symbol's neighborhood\n`,
      { stats },
    );
  }
  const signalComputer = createSignalComputer(params.store);
  const hits = collectImpactDetails({
    symbols: params.symbols,
    changeType: params.changeType,
    store: params.store,
    maxDepth: params.maxDepth,
    signalComputer,
  });

  if (hits.length === 0) return prependTrustHeader("", { stats });

  let hasLocalExceptions = false;
  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    if (stale) hasLocalExceptions = true;
    const why = formatImpactWhy(hit.signals, hit.chainConfidence);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}  ${why}`];
  });

  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
