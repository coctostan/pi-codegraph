import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";

export type SymbolResolution =
  | { kind: "not_found"; text: string }
  | { kind: "ambiguous"; text: string; nodes: GraphNode[] }
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

const MEMBER_NAME = /^[A-Za-z_$][\w$]*\.[^.]+$/;

/**
 * The nodes a tool's `name` names, scoped by `file`: those named exactly `name`, else, for a dotless `name`, the class
 * members named `Class.<name>`.
 */
export function findSymbolNodes(store: GraphStore, name: string, file?: string): GraphNode[] {
  const exact = store.findNodes(name, file);
  if (exact.length > 0 || name.includes(".")) return exact;
  const suffix = `.${name}`;
  const rows = store.queryRows<{ id: string; name: string }>(
    `SELECT id, name FROM nodes WHERE kind = 'function' AND substr(name, -?) = ?${file ? " AND file = ?" : ""} ORDER BY id`,
    file ? [suffix.length, suffix, file] : [suffix.length, suffix],
  );
  return rows.filter((row) => MEMBER_NAME.test(row.name)).flatMap((row) => store.getNode(row.id) ?? []);
}

export function resolveUniqueSymbol(params: {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
  notFoundLabel: string;
}): SymbolResolution {
  const nodes = findSymbolNodes(params.store, params.name, params.file);
  if (nodes.length === 0) {
    return { kind: "not_found", text: `${params.notFoundLabel} "${params.name}" not found` };
  }
  if (nodes.length > 1) {
    return { kind: "ambiguous", text: formatAmbiguousMatches(params.name, nodes, params.projectRoot), nodes };
  }
  return { kind: "unique", node: nodes[0]! };
}
