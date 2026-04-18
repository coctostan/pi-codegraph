import type { GraphStore, NeighborResult } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatRoleTags } from "../output/signals.js";
import { readSourceSnippet } from "../output/source.js";
import { prependTrustHeader } from "../output/trust.js";

export interface SymbolCardParams {
  name: string;
  file?: string;
  maxSourceLines?: number;
  store: GraphStore;
  projectRoot: string;
}

export interface RenderedSymbolCard {
  body: string;
  hasLocalExceptions: boolean;
}

export interface RenderedSymbolSection {
  body: string;
  hasLocalExceptions: boolean;
}

export function renderSymbolSourceSection(params: SymbolCardParams): RenderedSymbolSection {
  const { name, file, store, projectRoot, maxSourceLines } = params;
  const nodes = store.findNodes(name, file);
  if (nodes.length === 0) {
    return { body: `Symbol "${name}" not found`, hasLocalExceptions: false };
  }
  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    return { body: `${lines.join("\n")}\n`, hasLocalExceptions: lines.some((line) => line.includes("[stale]")) };
  }
  const node = nodes[0]!;
  const snippet = readSourceSnippet(node, projectRoot, maxSourceLines);
  const heading = snippet?.stale ? "### Source [stale]" : "### Source";
  return {
    body: `${heading}\n${snippet ? snippet.text : "source unavailable"}\n`,
    hasLocalExceptions: snippet?.stale ?? false,
  };
}

export function renderSymbolCardBody(params: SymbolCardParams): RenderedSymbolCard {
  const { name, file, store, projectRoot } = params;
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return { body: `Symbol "${name}" not found`, hasLocalExceptions: false };
  }
  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    return { body, hasLocalExceptions: lines.some((line) => line.includes("[stale]")) };
  }

  const node = nodes[0]!;
  const anchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const signals = signalComputer.compute(node.id);
  const allNeighbors = store.getNeighbors(node.id).filter(
    (nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"),
  );
  const lines: string[] = [];
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(anchor.anchor);
  lines.push("");
  lines.push("### Signature");
  lines.push(node.signature ?? "not available");

  const tests = allNeighbors.filter((nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id);
  if (tests.length > 0) {
    lines.push("");
    lines.push(`### Covering Tests (${tests.length})`);
    for (const t of tests) {
      const testAnchor = computeAnchor(t.node, projectRoot);
      lines.push(`  ${testAnchor.anchor}  "${t.node.name}"`);
    }
  }

  const callers = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.target === node.id);
  const callees = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.source === node.id);
  const imports = allNeighbors.filter((nr) => nr.edge.kind === "imports" && nr.edge.source === node.id);
  const extendsOut = allNeighbors.filter((nr) => nr.edge.kind === "extends" && nr.edge.source === node.id);
  const implementsOut = allNeighbors.filter((nr) => nr.edge.kind === "implements" && nr.edge.source === node.id);

  const relSections: string[] = [];
  if (callers.length > 0) relSections.push(formatRelGroup("Callers", callers));
  if (callees.length > 0) relSections.push(formatRelGroup("Callees", callees));
  if (imports.length > 0) relSections.push(formatRelGroup("Imports", imports));
  if (extendsOut.length > 0) relSections.push(formatRelGroup("Extends", extendsOut));
  if (implementsOut.length > 0) relSections.push(formatRelGroup("Implements", implementsOut));

  if (relSections.length > 0) {
    lines.push("");
    lines.push("### Key Relationships");
    lines.push(...relSections);
  }

  lines.push("");
  lines.push("### Signals");
  lines.push(formatRoleTags(signals));

  return {
    body: lines.join("\n") + "\n",
    hasLocalExceptions: anchor.stale,
  };
}

export function symbolCard(params: SymbolCardParams): string {
  const { name, file, store, projectRoot, maxSourceLines } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return prependTrustHeader(`Symbol "${name}" not found`, { stats });
  }

  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    const hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
    return prependTrustHeader(body, { stats, hasLocalExceptions });
  }

  const node = nodes[0]!;
  const anchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const signals = signalComputer.compute(node.id);
  const allNeighbors = store.getNeighbors(node.id).filter(
    (nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"),
  );

  const lines: string[] = [];

  // Header
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(anchor.anchor);

  // Source
  const renderedSource = renderSymbolSourceSection({
    name,
    file,
    store,
    projectRoot,
    maxSourceLines,
  });
  lines.push("");
  lines.push(renderedSource.body.trimEnd());

  // Signature
  lines.push("");
  lines.push("### Signature");
  lines.push(node.signature ?? "not available");

  // Exported
  lines.push("");
  lines.push("### Exported");
  lines.push(node.is_exported ? "yes" : "no");

  // Covering Tests
  const tests = allNeighbors.filter(
    (nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id,
  );
  if (tests.length > 0) {
    lines.push("");
    lines.push(`### Covering Tests (${tests.length})`);
    for (const t of tests) {
      const testAnchor = computeAnchor(t.node, projectRoot);
      lines.push(`  ${testAnchor.anchor}  "${t.node.name}"`);
    }
  }

  // Key Relationships
  const callers = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.target === node.id);
  const callees = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.source === node.id);
  const imports = allNeighbors.filter((nr) => nr.edge.kind === "imports" && nr.edge.source === node.id);
  const extendsOut = allNeighbors.filter((nr) => nr.edge.kind === "extends" && nr.edge.source === node.id);
  const implementsOut = allNeighbors.filter((nr) => nr.edge.kind === "implements" && nr.edge.source === node.id);

  const relSections: string[] = [];
  if (callers.length > 0) relSections.push(formatRelGroup("Callers", callers));
  if (callees.length > 0) relSections.push(formatRelGroup("Callees", callees));
  if (imports.length > 0) relSections.push(formatRelGroup("Imports", imports));
  if (extendsOut.length > 0) relSections.push(formatRelGroup("Extends", extendsOut));
  if (implementsOut.length > 0) relSections.push(formatRelGroup("Implements", implementsOut));

  if (relSections.length > 0) {
    lines.push("");
    lines.push("### Key Relationships");
    lines.push(...relSections);
  }

  // Signals
  lines.push("");
  lines.push("### Signals");
  lines.push(formatRoleTags(signals));

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats, hasLocalExceptions: anchor.stale || renderedSource.hasLocalExceptions });
}

function formatRelGroup(label: string, neighbors: NeighborResult[]): string {
  const top = neighbors.slice(0, 5);
  const lines: string[] = [];
  const names = top.map((nr) => nr.node.name);
  const suffix = neighbors.length > 5 ? ` (+${neighbors.length - 5} more)` : "";
  lines.push(`  ${label} (${neighbors.length}):  ${names.join(", ")}${suffix}`);
  for (const nr of top) {
    if (nr.node.signature) {
      lines.push(`    ${nr.node.name}: ${nr.node.signature}`);
    }
  }
  return lines.join("\n");
}
