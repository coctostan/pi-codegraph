import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";
import { resolverFailedKey, resolverMarkerKey } from "../graph/sqlite.js";
import type { GraphStore } from "../graph/store.js";
import type { ITsServerClient } from "./tsserver-client.js";

type ResolverKind = "callers" | "implementations";

function hasMarker(store: GraphStore, kind: ResolverKind, symbol: GraphNode): boolean {
  return store.getMetadata(resolverMarkerKey(kind, symbol.id)) !== null;
}

function setMarker(store: GraphStore, kind: ResolverKind, symbol: GraphNode): void {
  store.setMetadata(resolverMarkerKey(kind, symbol.id), "1");
  store.setMetadata(resolverFailedKey(kind, symbol.id), null);
}

/**
 * A tsserver that can't start (not installed) never will, so it is marked done rather than retried on every call.
 * A crash or timeout leaves the marker unset for the next call to retry, and a record that turns the result partial.
 */
function recordFailure(store: GraphStore, kind: ResolverKind, symbol: GraphNode, err: unknown): void {
  if (err instanceof Error && err.message.startsWith("TsServer failed to start:")) setMarker(store, kind, symbol);
  else store.setMetadata(resolverFailedKey(kind, symbol.id), "1");
}

function findSymbolColumn(projectRoot: string, file: string, line: number, symbolName: string): number {
  try {
    const lines = readFileSync(join(projectRoot, file), "utf8").split(/\r?\n/);
    const idx = (lines[line - 1] ?? "").indexOf(symbolName);
    return idx >= 0 ? idx + 1 : 1;
  } catch {
    return 1;
  }
}

function unresolvedNameFromTarget(target: string): string | null {
  if (!target.startsWith("__unresolved__::")) return null;
  return target.slice("__unresolved__::".length).split(":")[0] ?? null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function signatureImplementsInterface(signature: string | undefined, interfaceName: string): boolean {
  if (!signature) return false;
  const rx = new RegExp(`\\bimplements\\b[^\\{]*\\b${escapeRegex(interfaceName)}\\b`);
  return rx.test(signature);
}

function classImplementsInterface(
  projectRoot: string,
  file: string,
  className: string,
  interfaceName: string,
  signature?: string,
): boolean {
  if (signature != null) {
    return signatureImplementsInterface(signature, interfaceName);
  }

  try {
    const content = readFileSync(join(projectRoot, file), "utf8");
    const rx = new RegExp(
      `\\bclass\\s+${escapeRegex(className)}\\b[^\\{]*\\bimplements\\b[^\\{]*\\b${escapeRegex(interfaceName)}\\b`,
      "m",
    );
    return rx.test(content);
  } catch {
    return false;
  }
}

export async function resolveMissingCallers(
  node: GraphNode,
  store: GraphStore,
  projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  if (hasMarker(store, "callers", node)) return;

  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
  let refs;
  try {
    refs = await client.references(node.file, node.start_line, col);
  } catch (err) {
    recordFailure(store, "callers", node, err);
    // Do NOT create edges here — writing lsp-provenance edges from a name-match
    // fallback would misrepresent confidence; the existing unresolved tree-sitter
    // edges already capture the same information honestly.
    return;
  }
  const failedCalls = store.getFailedLookups();
  for (const ref of refs) {
    const callerNode = store
      .getNodesByFile(ref.file)
      .find((n) => n.kind !== "module" && n.start_line <= ref.line && (n.end_line === null || n.end_line >= ref.line));
    if (!callerNode) continue;
    // tsserver located this call, so a failed `definition` lookup on it hides no caller.
    for (const f of failedCalls) {
      if (f.source === callerNode.id && f.evidence.startsWith(`${node.name}:${ref.line}:`)) store.setLookupFailed(f.source, f.evidence, false);
    }
    if (callerNode.id === node.id) continue; // self reference/declaration

    const exists = store.getEdgesBySource(callerNode.id).some((e) => e.kind === "calls" && e.target === node.id);
    if (exists) continue;
    store.addEdge({
      source: callerNode.id,
      target: node.id,
      kind: "calls",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: `${ref.file}:${ref.line}:${ref.col}`,
        content_hash: callerNode.content_hash,
      },
      created_at: Date.now(),
    });
  }

  setMarker(store, "callers", node);
}


export async function resolveImplementations(
  node: GraphNode,
  store: GraphStore,
  projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  const syncDeclaredImplementations = () => {
    const declared = new Map<string, GraphNode>();
    const classFiles = new Set(store.listFiles());
    for (const row of store.queryRows<{ file: string }>("SELECT DISTINCT file FROM nodes WHERE kind = ?", ["class"])) {
      classFiles.add(row.file);
    }

    for (const file of classFiles) {
      for (const classNode of store.getNodesByFile(file).filter((n) => n.kind === "class")) {
        if (!classImplementsInterface(projectRoot, classNode.file, classNode.name, node.name, classNode.signature)) continue;
        declared.set(classNode.id, classNode);
        const exists = store
          .getEdgesBySource(classNode.id)
          .some((e) => e.kind === "implements" && e.target === node.id && e.provenance.source === "lsp");
        if (!exists) {
          store.addEdge({
            source: classNode.id,
            target: node.id,
            kind: "implements",
            provenance: {
              source: "lsp",
              confidence: 0.9,
              evidence: `${classNode.file}:${classNode.start_line}:1`,
              content_hash: classNode.content_hash,
            },
            created_at: Date.now(),
          });
        }
      }
    }

    for (const neighbor of store.getNeighbors(node.id, { direction: "in", kind: "implements" })) {
      if (neighbor.edge.provenance.source !== "lsp") continue;
      if (declared.has(neighbor.node.id)) continue;
      store.deleteEdge(neighbor.edge.source, neighbor.edge.target, neighbor.edge.kind, neighbor.edge.provenance.source);
    }
  };

  if (hasMarker(store, "implementations", node)) {
    syncDeclaredImplementations();
    return;
  }
  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
  let impls;
  try {
    impls = await client.implementations(node.file, node.start_line, col);
  } catch (err) {
    syncDeclaredImplementations();
    recordFailure(store, "implementations", node, err);
    return;
  }
  for (const implLoc of impls ?? []) {
    const implNode = store
      .getNodesByFile(implLoc.file)
      .find((n) => n.kind === "class" && n.start_line <= implLoc.line && (n.end_line === null || n.end_line >= implLoc.line));
    if (!implNode) continue;
    if (!classImplementsInterface(projectRoot, implNode.file, implNode.name, node.name, implNode.signature)) continue;
    const exists = store.getEdgesBySource(implNode.id).some((e) => e.kind === "implements" && e.target === node.id);
    if (exists) continue;
    store.addEdge({
      source: implNode.id,
      target: node.id,
      kind: "implements",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: `${implLoc.file}:${implLoc.line}:${implLoc.col}`,
        content_hash: implNode.content_hash,
      },
      created_at: Date.now(),
    });
  }
  syncDeclaredImplementations();
  setMarker(store, "implementations", node);
}
