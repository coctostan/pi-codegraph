import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";

export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";

export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
}

export interface ImpactItem {
  nodeId: string;
  name: string;
  file: string;
  depth: number;
  classification: ImpactClassification;
}

function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
  if (changeType === "addition") return null;
  if (changeType === "behavior_change") return "behavioral";
  if (changeType === "signature_change" || changeType === "removal") {
    return depth === 1 ? "breaking" : "behavioral";
  }
  return null;
}

export function collectImpact(params: CollectImpactParams): ImpactItem[] {
  const { symbols, changeType, store, maxDepth = 5 } = params;
  if (changeType === "addition") return [];

  const queue: Array<{ id: string; depth: number }> = [];
  const seen = new Set<string>();
  const results: ImpactItem[] = [];

  for (const symbol of symbols) {
    for (const node of store.findNodes(symbol)) {
      queue.push({ id: node.id, depth: 0 });
      seen.add(node.id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inbound = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
    for (const neighbor of inbound) {
      if (seen.has(neighbor.node.id)) continue;
      const depth = current.depth + 1;
      seen.add(neighbor.node.id);
      queue.push({ id: neighbor.node.id, depth });
      const classification = classify(changeType, depth);
      if (!classification) continue;
      results.push({
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
      });
    }
  }

  return results.sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  const hits = collectImpact({
    symbols: params.symbols,
    changeType: params.changeType,
    store: params.store,
    maxDepth: params.maxDepth,
  });
  if (hits.length === 0) return "";
  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}`];
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
