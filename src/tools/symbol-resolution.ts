import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";

export type SymbolResolution =
  | { kind: "not_found"; text: string }
  | { kind: "ambiguous"; text: string }
  | { kind: "unique"; node: GraphNode };

export function formatAmbiguousMatches(name: string, nodes: GraphNode[], projectRoot: string): string {
  const lines: string[] = [`Multiple matches for "${name}":`, ""];
  for (const node of nodes) {
    const anchor = computeAnchor(node, projectRoot);
    const staleMarker = anchor.stale ? " [stale]" : "";
    lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
  }
  return `${lines.join("\n")}\n`;
}

export function resolveUniqueSymbol(params: {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
  notFoundLabel: string;
}): SymbolResolution {
  const nodes = params.store.findNodes(params.name, params.file);
  if (nodes.length === 0) {
    return { kind: "not_found", text: `${params.notFoundLabel} "${params.name}" not found` };
  }
  if (nodes.length > 1) {
    return { kind: "ambiguous", text: formatAmbiguousMatches(params.name, nodes, params.projectRoot) };
  }
  return { kind: "unique", node: nodes[0]! };
}
