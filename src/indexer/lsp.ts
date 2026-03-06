import type { GraphEdge } from "../graph/types.js";
import type { GraphStore } from "../graph/store.js";
import type { ITsServerClient } from "./tsserver-client.js";

function parseEvidence(evidence: string): { name: string; line: number; col: number } | null {
  const parts = evidence.split(":");
  if (parts.length !== 3) return null;
  const [name, lineStr, colStr] = parts;
  const line = Number(lineStr);
  const col = Number(colStr);
  if (!name || !Number.isFinite(line) || !Number.isFinite(col)) return null;
  return { name, line, col };
}

function isStartupError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("TsServer failed to start:");
}

function isUnresolvedTarget(target: string): boolean {
  return target.startsWith("__unresolved__::");
}

function makeLspEdge(source: string, target: string, evidence: string, contentHash: string): GraphEdge {
  return {
    source,
    target,
    kind: "calls",
    provenance: {
      source: "lsp",
      confidence: 0.9,
      evidence,
      content_hash: contentHash,
    },
    created_at: Date.now(),
  };
}

export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  const unresolved = store.getUnresolvedEdges().filter((e) => e.kind === "calls" && e.provenance.source === "tree-sitter");

  const confirmed: GraphEdge[] = [];
  for (const file of store.listFiles()) {
    for (const node of store.getNodesByFile(file)) {
      for (const e of store.getEdgesBySource(node.id)) {
        if (e.kind === "calls" && e.provenance.source === "tree-sitter" && !isUnresolvedTarget(e.target)) {
          confirmed.push(e);
        }
      }
    }
  }

  const work = [...unresolved, ...confirmed];

  for (const edge of work) {
    const sourceNode = store.getNode(edge.source);
    if (!sourceNode) continue;
    const parsed = parseEvidence(edge.provenance.evidence);
    if (!parsed) continue;

    let loc;
    try {
      loc = await client.definition(sourceNode.file, parsed.line, parsed.col);
    } catch (err) {
      if (isStartupError(err)) return;
      continue;
    }

    if (!loc) continue;

    if (isUnresolvedTarget(edge.target)) {
      const targetNode = store
        .getNodesByFile(loc.file)
        .find((n) => n.name === parsed.name && n.start_line === loc.line);
      if (!targetNode) continue;
      store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
      store.addEdge(makeLspEdge(edge.source, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
      continue;
    }

    const existingTarget = store.getNode(edge.target);
    if (!existingTarget) continue;

    const sameTarget = existingTarget.file === loc.file && existingTarget.start_line === loc.line;
    if (!sameTarget) continue;

    store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
    store.addEdge(makeLspEdge(edge.source, edge.target, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
  }
}
