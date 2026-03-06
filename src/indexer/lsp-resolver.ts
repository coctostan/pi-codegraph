import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";
import type { GraphStore } from "../graph/store.js";
import type { ITsServerClient } from "./tsserver-client.js";

function markerNodeId(kind: "callers" | "implementations", symbolId: string): string {
  return `__meta__::resolver::${kind}::${symbolId}`;
}

function hasMarker(store: GraphStore, kind: "callers" | "implementations", symbol: GraphNode): boolean {
  const id = markerNodeId(kind, symbol.id);
  if (store.getNode(id) === null) return false;
  // After a file re-index the marker node survives but its outbound edge is deleted.
  // Only treat the marker as valid when the edge still points to the symbol.
  return store.getEdgesBySource(id).some((e) => e.target === symbol.id);
}

function setMarker(store: GraphStore, kind: "callers" | "implementations", symbol: GraphNode): void {
  const id = markerNodeId(kind, symbol.id);
  store.addNode({
    id,
    kind: "module",
    name: id,
    file: "__meta__/resolver",
    start_line: 1,
    end_line: 1,
    content_hash: "meta",
  });
  store.addEdge({
    source: id,
    target: symbol.id,
    kind: "imports",
    provenance: { source: "lsp", confidence: 1, evidence: `resolved:${kind}`, content_hash: "meta" },
    created_at: Date.now(),
  });
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

function classImplementsInterface(projectRoot: string, file: string, className: string, interfaceName: string): boolean {
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
    // If tsserver is permanently unavailable (not installed), set the marker so we
    // don't retry on every symbol_graph call.  For transient failures (crash, timeout,
    // etc.) leave the marker unset so the next call can succeed.
    if (err instanceof Error && err.message.startsWith("TsServer failed to start:")) {
      setMarker(store, "callers", node);
    }
    // Do NOT create edges here — writing lsp-provenance edges from a name-match
    // fallback would misrepresent confidence; the existing unresolved tree-sitter
    // edges already capture the same information honestly.
    return;
  }
  for (const ref of refs) {
    const callerNode = store
      .getNodesByFile(ref.file)
      .find((n) => n.kind !== "module" && n.start_line <= ref.line && (n.end_line === null || n.end_line >= ref.line));
    if (!callerNode) continue;
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
  if (hasMarker(store, "implementations", node)) return;

  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
  const addFallbackImplementations = () => {
    for (const file of store.listFiles()) {
      for (const classNode of store.getNodesByFile(file).filter((n) => n.kind === "class")) {
        if (!classImplementsInterface(projectRoot, classNode.file, classNode.name, node.name)) continue;
        const exists = store
          .getEdgesBySource(classNode.id)
          .some((e) => e.kind === "implements" && e.target === node.id);
        if (exists) continue;
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
    setMarker(store, "implementations", node);
  };
  let impls;
  try {
    impls = await client.implementations(node.file, node.start_line, col);
  } catch {
    addFallbackImplementations();
    return;
  }

  if (!impls || impls.length === 0) {
    addFallbackImplementations();
    return;
  }

  for (const implLoc of impls) {
    const implNode = store
      .getNodesByFile(implLoc.file)
      .find((n) => n.kind === "class" && n.start_line <= implLoc.line && (n.end_line === null || n.end_line >= implLoc.line));

    if (!implNode) continue;

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

  setMarker(store, "implementations", node);
}
