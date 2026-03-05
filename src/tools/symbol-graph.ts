import type { GraphStore, NeighborResult } from "../graph/store.js";
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  type AnchoredNeighbor,
  type NeighborSection,
} from "../output/anchoring.js";

export interface SymbolGraphParams {
  name: string;
  file?: string;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}

function toAnchoredNeighbor(nr: NeighborResult, projectRoot: string): AnchoredNeighbor {
  const anchor = computeAnchor(nr.node, projectRoot);
  return {
    anchor,
    name: nr.node.name,
    edgeKind: nr.edge.kind,
    confidence: nr.edge.provenance.confidence,
    provenanceSource: nr.edge.provenance.source,
  };
}

function buildSection(
  neighbors: NeighborResult[],
  limit: number,
  projectRoot: string,
): NeighborSection {
  const ranked = rankNeighbors(neighbors, limit);
  return {
    items: ranked.kept.map((nr) => toAnchoredNeighbor(nr, projectRoot)),
    omitted: ranked.omitted,
  };
}

export function symbolGraph(params: SymbolGraphParams): string {
  const { name, file, limit = 10, store, projectRoot } = params;

  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return `Symbol "${name}" not found`;
  }

  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    return `${lines.join("\n")}\n`;
  }

  const node = nodes[0]!;
  const symbolAnchor = computeAnchor(node, projectRoot);

  const allNeighbors = store.getNeighbors(node.id);

  const callerResults: NeighborResult[] = [];
  const calleeResults: NeighborResult[] = [];
  const importResults: NeighborResult[] = [];
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of allNeighbors) {
    if (nr.node.file.startsWith("__unresolved__")) {
      unresolvedResults.push(nr);
      continue;
    }

    if (nr.edge.kind === "calls") {
      if (nr.edge.target === node.id) {
        callerResults.push(nr);
      } else {
        calleeResults.push(nr);
      }
    } else if (nr.edge.kind === "imports" && nr.edge.source === node.id) {
      importResults.push(nr);
    }
  }

  const callers = buildSection(callerResults, limit, projectRoot);
  const callees = buildSection(calleeResults, limit, projectRoot);
  const imports = buildSection(importResults, limit, projectRoot);
  const unresolved = buildSection(unresolvedResults, limit, projectRoot);

  return formatNeighborhood(
    { name: node.name, kind: node.kind, anchor: symbolAnchor },
    callers,
    callees,
    imports,
    unresolved,
  );
}
