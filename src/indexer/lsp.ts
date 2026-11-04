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

function makeLspEdge(from: GraphEdge, target: string, evidence: string, contentHash: string): GraphEdge {
  return {
    source: from.source,
    target,
    kind: "calls",
    provenance: {
      source: "lsp",
      confidence: 0.9,
      evidence,
      content_hash: contentHash,
    },
    created_at: Date.now(),
    ...(from.call_end ? { call_end: from.call_end } : {}),
  };
}

export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<number> {
  let errors = 0;
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
  // Every run asks each call again, so a record is current once this run has asked; one whose call is gone goes now.
  // Each write waits on a change, so an unchanged index writes nothing.
  const key = (source: string, evidence: string) => `${source}\0${evidence}`;
  const recorded = store.getFailedLookups().filter((f) => f.kind === "definition");
  const failed = new Set(recorded.map((f) => key(f.source, f.evidence)));
  const recordLookup = (source: string, evidence: string, failedNow: boolean) => {
    if (failed.has(key(source, evidence)) === failedNow) return;
    try {
      store.setLookupFailed({ kind: "definition", source, evidence }, failedNow);
    } catch {
      errors++;
    }
  };
  const asked = new Set(work.map((e) => key(e.source, e.provenance.evidence)));
  for (const f of recorded) if (!asked.has(key(f.source, f.evidence))) recordLookup(f.source, f.evidence, false);
  for (const edge of work) {
    const sourceNode = store.getNode(edge.source);
    if (!sourceNode) continue;
    const parsed = parseEvidence(edge.provenance.evidence);
    if (!parsed) continue;
    let loc;
    try {
      loc = await client.definition(sourceNode.file, parsed.line, parsed.col);
    } catch (err) {
      if (isStartupError(err)) return errors;
      recordLookup(edge.source, edge.provenance.evidence, true);
      continue;
    }
    recordLookup(edge.source, edge.provenance.evidence, false);
    if (!loc) continue;
    if (isUnresolvedTarget(edge.target)) {
      const targetNode = store
        .getNodesByFile(loc.file)
        .find((n) => n.name === parsed.name && n.start_line === loc.line);
      if (!targetNode) continue;
      try {
        store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
        store.addEdge(makeLspEdge(edge, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
      } catch {
        errors++;
      }
      continue;
    }
    const existingTarget = store.getNode(edge.target);
    if (!existingTarget) continue;
    const sameTarget = existingTarget.file === loc.file && existingTarget.start_line === loc.line;
    if (!sameTarget) continue;
    try {
      store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
      store.addEdge(makeLspEdge(edge, edge.target, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
    } catch {
      errors++;
    }
  }
  return errors;
}
