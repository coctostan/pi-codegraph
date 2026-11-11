import type { GraphStore, NeighborResult } from "../graph/store.js";
import { isUnresolved, type GraphNode } from "../graph/types.js";
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
import { createSignalComputer, formatRoleTags } from "../output/signals.js";
import { readSourceSnippet } from "../output/source.js";
import { prependTrustHeader } from "../output/trust.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";

export interface SymbolCardParams {
  name: string;
  file?: string;
  maxSourceLines?: number;
  store: GraphStore;
  projectRoot: string;
}

/** A section renderer's input: the node the caller already resolved. */
export interface ResolvedNodeParams {
  node: GraphNode;
  store: GraphStore;
  projectRoot: string;
  maxSourceLines?: number;
}

export interface RenderedSymbolCard {
  body: string;
  hasLocalExceptions: boolean;
}

export interface RenderedSymbolSection {
  body: string;
  hasLocalExceptions: boolean;
}

export function renderSymbolSourceSection(params: ResolvedNodeParams): RenderedSymbolSection {
  const snippet = readSourceSnippet(params.node, params.projectRoot, params.maxSourceLines);
  const heading = snippet?.stale ? "### Source [stale]" : "### Source";
  return {
    body: `${heading}\n${snippet ? snippet.text : "source unavailable"}\n`,
    hasLocalExceptions: snippet?.stale ?? false,
  };
}

export function renderSymbolCardBody(params: ResolvedNodeParams): RenderedSymbolCard {
  const { node, store, projectRoot } = params;
  const anchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const signals = signalComputer.compute(node.id);
  const allNeighbors = store.getNeighbors(node.id).filter(
    (nr) => !isUnresolved(nr.node.id),
  );
  const lines: string[] = [];
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(formatAnchorLocation(anchor));
  lines.push("");
  lines.push("### Signature");
  lines.push(node.signature ?? "not available");

  const tests = allNeighbors.filter((nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id);
  if (tests.length > 0) {
    lines.push("");
    lines.push(`### Covering Tests (${tests.length})`);
    for (const t of tests) {
      const testAnchor = computeAnchor(t.node, projectRoot);
      lines.push(`  ${formatAnchorLocation(testAnchor)}  "${t.node.name}"`);
    }
  }

  const allCallers = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.target === node.id);
  const callers = allCallers.filter((nr) => nr.node.kind !== "test");
  const testCallers = allCallers.filter((nr) => nr.node.kind === "test");
  const callees = allNeighbors.filter((nr) => nr.edge.kind === "calls" && nr.edge.source === node.id);
  const imports = allNeighbors.filter((nr) => nr.edge.kind === "imports" && nr.edge.source === node.id);
  const extendsOut = allNeighbors.filter((nr) => nr.edge.kind === "extends" && nr.edge.source === node.id);
  const implementsOut = allNeighbors.filter((nr) => nr.edge.kind === "implements" && nr.edge.source === node.id);

  const relSections: string[] = [];
  if (callers.length > 0) relSections.push(formatRelGroup("Callers", callers));
  if (testCallers.length > 0) relSections.push(formatTestCallers(testCallers));
  if (callees.length > 0) relSections.push(formatRelGroup("Callees", callees));
  if (imports.length > 0) relSections.push(formatRelGroup("Imports", imports));
  if (extendsOut.length > 0) relSections.push(formatRelGroup("Extends", extendsOut));
  if (implementsOut.length > 0) relSections.push(formatRelGroup("Implements", implementsOut));

  if (relSections.length > 0) {
    lines.push("");
    lines.push("### Key Relationships");
    lines.push(...relSections);
  }

  const tags = formatRoleTags(signals);
  if (tags) lines.push("", "### Signals", tags);

  return {
    body: lines.join("\n") + "\n",
    hasLocalExceptions: anchor.stale,
  };
}

export function symbolCard(params: SymbolCardParams): string {
  const { store, projectRoot, maxSourceLines } = params;
  const stats = store.getStatistics(projectRoot);
  const resolved = resolveUniqueSymbol({ ...params, notFoundLabel: "Symbol" });
  if (resolved.kind === "not_found") return prependTrustHeader(resolved.text, { stats });
  if (resolved.kind === "ambiguous") {
    return prependTrustHeader(resolved.text, { stats, hasLocalExceptions: resolved.text.includes("[stale]") });
  }

  const node = resolved.node;
  const anchor = computeAnchor(node, projectRoot);
  const signalComputer = createSignalComputer(store);
  const signals = signalComputer.compute(node.id);
  const allNeighbors = store.getNeighbors(node.id).filter(
    (nr) => !isUnresolved(nr.node.id),
  );

  const lines: string[] = [];

  // Header
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(formatAnchorLocation(anchor));

  // Source
  const renderedSource = renderSymbolSourceSection({ node, store, projectRoot, maxSourceLines });
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
      lines.push(`  ${formatAnchorLocation(testAnchor)}  "${t.node.name}"`);
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
  const tags = formatRoleTags(signals);
  if (tags) lines.push("", "### Signals", tags);

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats, hasLocalExceptions: anchor.stale || renderedSource.hasLocalExceptions });
}

const TEST_CALLER_FILE_LIMIT = 10;

/** The files of the test cases calling a node, sorted, cut to the ones the card names. */
export function namedTestCallerFiles(tests: NeighborResult[]): string[] {
  return [...new Set(tests.map((nr) => nr.node.file))].sort().slice(0, TEST_CALLER_FILE_LIMIT);
}

/** Test cases calling the node, by file, each with its case count when above one. */
function formatTestCallers(tests: NeighborResult[]): string {
  const fileCount = new Set(tests.map((nr) => nr.node.file)).size;
  const named = namedTestCallerFiles(tests).map((file) => {
    const count = tests.filter((nr) => nr.node.file === file).length;
    return count > 1 ? `${file} (${count})` : file;
  });
  const suffix = fileCount > named.length ? ` (+${fileCount - named.length} more files)` : "";
  const fileWord = fileCount === 1 ? "file" : "files";
  return `  Test callers (${tests.length} in ${fileCount} ${fileWord}):  ${named.join(", ")}${suffix}`;
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
