import type { GraphStore, NeighborResult } from "../graph/store.js";
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  type AnchoredNeighbor,
  type NeighborSection,
} from "../output/anchoring.js";
import { createSignalComputer, type NodeSignals } from "../output/signals.js";

export interface SymbolGraphParams {
  name: string;
  file?: string;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
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
  const signalComputer = createSignalComputer(store);

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

  const callers = buildSection(callerResults, limit, projectRoot, store, (nodeId) => signalComputer.compute(nodeId));
  const callees = buildSection(calleeResults, limit, projectRoot, store, (nodeId) => signalComputer.compute(nodeId));
  const imports = buildSection(importResults, limit, projectRoot, store, (nodeId) => signalComputer.compute(nodeId));
  const unresolved = buildSection(unresolvedResults, limit, projectRoot, store);

  return formatNeighborhood(
    { name: node.name, kind: node.kind, anchor: symbolAnchor, signals: signalComputer.compute(node.id) },
    callers,
    callees,
    imports,
    unresolved,
  );
}
