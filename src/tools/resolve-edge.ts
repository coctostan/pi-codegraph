import type { GraphStore } from "../graph/store.js";
import type { GraphNode, EdgeKind } from "../graph/types.js";
import { computeAnchor } from "../output/anchoring.js";

const VALID_EDGE_KINDS: EdgeKind[] = [
  "calls",
  "imports",
  "implements",
  "extends",
  "tested_by",
  "co_changes_with",
  "renders",
  "routes_to",
];

function isValidEdgeKind(kind: string): kind is EdgeKind {
  return VALID_EDGE_KINDS.includes(kind as EdgeKind);
}

export interface ResolveEdgeParams {
  source: string;
  target: string;
  sourceFile?: string;
  targetFile?: string;
  kind: string;
  evidence: string;
  store: GraphStore;
  projectRoot: string;
}

function formatDisambiguation(label: string, nodes: GraphNode[]): string {
  const lines: string[] = [`Ambiguous ${label} — multiple matches:`];
  for (const node of nodes) {
    lines.push(`  ${node.file}  ${node.kind}  line ${node.start_line}`);
  }
  lines.push(`\nSpecify ${label}File to disambiguate.`);
  return lines.join("\n");
}

export function resolveEdge(params: ResolveEdgeParams): string {
  const { source, target, sourceFile, targetFile, kind, evidence, store, projectRoot } = params;

  // Look up source node
  const sourceNodes = store.findNodes(source, sourceFile);
  if (sourceNodes.length === 0) {
    return `Source symbol "${source}" not found`;
  }
  if (sourceNodes.length > 1) {
    return formatDisambiguation("source", sourceNodes);
  }

  // Look up target node
  const targetNodes = store.findNodes(target, targetFile);
  if (targetNodes.length === 0) {
    return `Target symbol "${target}" not found`;
  }
  if (targetNodes.length > 1) {
    return formatDisambiguation("target", targetNodes);
  }
  // Validate edge kind
  if (!isValidEdgeKind(kind)) {
    return `Invalid edge kind "${kind}". Valid kinds: ${VALID_EDGE_KINDS.join(", ")}`;
  }
  const sourceNode = sourceNodes[0]!;
  const targetNode = targetNodes[0]!;
  const contentHash = store.getFileHash(sourceNode.file) ?? sourceNode.content_hash;
  // Check for existing agent edge (upsert detection)
  const existingNeighbors = store.getNeighbors(sourceNode.id, { direction: "out", kind });
  const existed = existingNeighbors.some(
    (nr) => nr.edge.target === targetNode.id && nr.edge.provenance.source === "agent"
  );
  store.addEdge({
    source: sourceNode.id,
    target: targetNode.id,
    kind,
    provenance: { source: "agent", confidence: 0.7, evidence, content_hash: contentHash },
    created_at: Date.now(),
  });
  const sourceAnchor = computeAnchor(sourceNode, projectRoot);
  const targetAnchor = computeAnchor(targetNode, projectRoot);
  const action = existed ? "updated" : "created";
  return [
    `Edge ${action}:`,
    `  source: ${sourceAnchor.anchor}  ${sourceNode.name}`,
    `  target: ${targetAnchor.anchor}  ${targetNode.name}`,
    `  kind: ${kind}`,
    "  provenance: agent  confidence:0.7",
  ].join("\n");
}
