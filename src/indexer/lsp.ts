import type { GraphEdge, GraphNode } from "../graph/types.js";
import { isMemberCall, isUnresolved } from "../graph/types.js";
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

type CallEnd = GraphEdge["call_end"];
const endsBefore = (a: CallEnd, b: CallEnd): boolean => !!a && (!b || a.line < b.line || (a.line === b.line && a.col < b.col));
const span = (n: GraphNode) => (n.end_line ?? n.start_line) - n.start_line;

/**
 * The node a definition at `loc` declares for a call to `name`: the narrowest function or class in its file named
 * `name` or `<Class>.<name>` whose span holds it, so a decorated member, which starts at its decorator, still does; for
 * a class, its constructor when it declares one. Two as narrow, namesakes on one line, are no answer: nodes hold no
 * column to tell them apart.
 */
function definedAt(store: GraphStore, loc: { file: string; line: number }, name: string): GraphNode | undefined {
  const nodes = store.getNodesByFile(loc.file);
  const [found, next] = nodes
    .filter((n) => (n.kind === "function" || n.kind === "class") && (n.name === name || n.name.endsWith(`.${name}`)))
    .filter((n) => n.start_line <= loc.line && loc.line <= (n.end_line ?? n.start_line))
    .sort((a, b) => span(a) - span(b));
  if (found && next && span(next) === span(found)) return undefined;
  if (found?.kind !== "class") return found;
  return nodes.find((n) => n.name === `${found.name}.constructor` && found.start_line <= n.start_line && n.start_line <= (found.end_line ?? found.start_line)) ?? found;
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
  // An `obj.m()` can reach a project node only when some class declares an `m`; tsserver is asked about no other.
  const memberNames = new Set(
    store.queryRows<{ name: string }>("SELECT name FROM nodes WHERE kind = 'function' AND INSTR(name, '.') > 0").map((r) => r.name.slice(r.name.indexOf(".") + 1)),
  );
  const members: GraphEdge[] = [];
  const confirmed: GraphEdge[] = [];
  for (const file of store.listFiles()) {
    for (const node of store.getNodesByFile(file)) {
      for (const e of store.getEdgesBySource(node.id)) {
        if (e.kind !== "calls" || e.provenance.source !== "tree-sitter" || isUnresolved(e.target)) continue;
        if (!isMemberCall(e.target)) confirmed.push(e);
        else if (memberNames.has(parseEvidence(e.provenance.evidence)?.name ?? "")) members.push(e);
      }
    }
  }
  const work = [...unresolved, ...members, ...confirmed];
  // Every run asks each call again, so a record is current once this run has asked; one whose call is gone goes now.
  // Each write waits on a change, so an unchanged index writes nothing.
  const key = (source: string, evidence: string) => `${source}\0${evidence}`;
  const recorded = store.getFailures().filter((f) => f.kind === "definition");
  const failed = new Set(recorded.map((f) => key(f.source, f.evidence)));
  const recordLookup = (source: string, evidence: string, failedNow: boolean) => {
    if (failed.has(key(source, evidence)) === failedNow) return;
    try {
      store.setFailed({ kind: "definition", source, evidence }, failedNow);
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
    const target = definedAt(store, loc, parsed.name);
    // A call tree-sitter resolved stays put unless tsserver agrees on its target.
    const pending = isUnresolved(edge.target) || isMemberCall(edge.target);
    if (!target || (!pending && target.id !== edge.target)) continue;
    try {
      // Add before delete: a failed add keeps the call for the next run to resolve. Of a caller's calls to one target,
      // the first to end places it, as in tree-sitter's edges.
      const kept = store.getEdgesBySource(edge.source).find((e) => e.target === target.id && e.kind === "calls" && e.provenance.source === "lsp");
      if (!kept || endsBefore(edge.call_end, kept.call_end)) {
        store.addEdge(makeLspEdge(edge, target.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
      }
      store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
    } catch {
      errors++;
    }
  }
  return errors;
}
