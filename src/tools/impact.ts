import type { GraphStore, NeighborResult } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
import { createSignalComputer } from "../output/signals.js";
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
import { findSymbolNodes, formatAmbiguousMatches } from "./symbol-resolution.js";

export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";

interface CollectImpactParams {
  /** The changed nodes, already resolved from the requested names. */
  seeds: GraphNode[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
}

/** A dependent reached at its shallowest depth, with the edge that first reached it. */
interface ImpactItem {
  node: GraphNode;
  depth: number;
  classification: ImpactClassification;
  edge: NeighborResult["edge"];
}

function classify(changeType: ChangeType, depth: number): ImpactClassification {
  return depth === 1 && (changeType === "signature_change" || changeType === "removal") ? "breaking" : "behavioral";
}

function dedupeInboundByStrongestEdge(inbound: NeighborResult[]): NeighborResult[] {
  const bestByNode = new Map<string, NeighborResult>();
  for (const hit of inbound) {
    const existing = bestByNode.get(hit.node.id);
    if (!existing || hit.edge.provenance.confidence > existing.edge.provenance.confidence) {
      bestByNode.set(hit.node.id, hit);
    }
  }
  return [...bestByNode.values()];
}

function compareItems(a: ImpactItem, b: ImpactItem): number {
  return a.depth - b.depth
    || a.node.file.localeCompare(b.node.file)
    || a.node.start_line - b.node.start_line
    || a.node.name.localeCompare(b.node.name);
}

/** Callers and implementors of the seeds, breadth-first up to `maxDepth`, by depth then file then line. */
function collectImpact(params: CollectImpactParams): ImpactItem[] {
  const { seeds, changeType, store, maxDepth = 5 } = params;
  if (changeType === "addition") return [];

  const queue = seeds.map((node) => ({ id: node.id, depth: 0 }));
  const seen = new Set(seeds.map((node) => node.id));
  const items: ImpactItem[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inboundCalls = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
    const inboundImplements = store.getNeighbors(current.id, { direction: "in", kind: "implements" });
    for (const neighbor of dedupeInboundByStrongestEdge([...inboundCalls, ...inboundImplements])) {
      if (seen.has(neighbor.node.id)) continue;
      seen.add(neighbor.node.id);
      const depth = current.depth + 1;
      queue.push({ id: neighbor.node.id, depth });
      items.push({ node: neighbor.node, depth, classification: classify(changeType, depth), edge: neighbor.edge });
    }
  }

  return items.sort(compareItems);
}

const TEST_FILE = /\.(test|spec)\.tsx?$/;

/** A test case, or a helper or module of a test file: listed by file, apart from the rows. */
function isTest(node: GraphNode): boolean {
  return node.kind === "test" || TEST_FILE.test(node.file);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The heading, then each test file reached, sorted, with its case count when above one. */
function formatTestsReached(heading: string, tests: GraphNode[]): string[] {
  const casesByFile = new Map<string, number>();
  for (const node of tests) {
    casesByFile.set(node.file, (casesByFile.get(node.file) ?? 0) + (node.kind === "test" ? 1 : 0));
  }
  const files = [...casesByFile.keys()].sort();
  const caseCount = tests.filter((node) => node.kind === "test").length;
  return [
    `${heading} (${plural(caseCount, "case")} in ${plural(files.length, "file")}):`,
    ...files.map((file) => (casesByFile.get(file)! > 1 ? `${file} (${casesByFile.get(file)})` : file)),
  ];
}

function buildEmptyImpactDiagnostic(seeds: GraphNode[], store: GraphStore, maxDepth: number): string {
  const signalComputer = createSignalComputer(store);
  const lines = seeds.map((node) => {
    if (node.kind === "interface") {
      return `No call-edge dependents found for interface '${node.name}'. Consider checking implementors via symbol_graph.`;
    }
    if (signalComputer.compute(node.id).roles.includes("entry-point")) {
      return `No dependents found — '${node.name}' is an entry point with no callers.`;
    }
    return `No dependents found for '${node.name}' within depth ${maxDepth}.`;
  });
  return `${lines.join("\n")}\n`;
}

export interface ImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}

/** The rendered impact plus whether every requested symbol resolved to exactly one node. */
export function impactResult(params: ImpactParams): { text: string; resolved: boolean } {
  const matches = (params.symbols ?? []).map((symbol) => findSymbolNodes(params.store, symbol));
  const resolved = matches.length > 0 && matches.every((nodes) => nodes.length === 1);
  const targetNodes = matches.flat();
  const withFreshness = (
    body: string,
    resultNodes = targetNodes,
    resultEdges: NeighborResult["edge"][] = [],
  ) => ({
    text: prependFreshnessHeader(
      body,
      evaluateFreshness({
        store: params.store,
        projectRoot: params.projectRoot,
        targetNodes,
        resultNodes,
        resultEdges,
        caveat: "impact may be incomplete",
      }),
    ),
    resolved,
  });

  // Defensive: validate symbols parameter (#065)
  if (!params.symbols || params.symbols.length === 0) {
    return withFreshness(
      "Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n",
    );
  }

  // Defensive: validate changeType (#065)
  const validChangeTypes: ChangeType[] = ["signature_change", "removal", "behavior_change", "addition"];
  if (!validChangeTypes.includes(params.changeType)) {
    return withFreshness(
      `Error: Invalid changeType "${params.changeType}". Must be one of: ${validChangeTypes.join(", ")}\n`,
    );
  }

  for (const [i, nodes] of matches.entries()) {
    const symbol = params.symbols[i]!;
    if (nodes.length === 0) return withFreshness(`Symbol "${symbol}" not found`);
    if (nodes.length > 1) return withFreshness(formatAmbiguousMatches(symbol, nodes, params.projectRoot));
  }

  if (params.changeType === "addition") {
    return withFreshness(
      `addition: impact analysis for additions is not yet supported — use symbol_graph to inspect the new symbol's neighborhood\n`,
    );
  }

  const hits = collectImpact({
    seeds: targetNodes,
    changeType: params.changeType,
    store: params.store,
    maxDepth: params.maxDepth,
  });

  if (hits.length === 0) {
    return withFreshness(buildEmptyImpactDiagnostic(targetNodes, params.store, params.maxDepth ?? 5));
  }

  const lines = hits.filter((hit) => !isTest(hit.node)).map((hit) => {
    const anchor = computeAnchor(hit.node, params.projectRoot);
    return `${formatAnchorLocation(anchor)}  ${hit.node.name}  ${hit.classification}  depth:${hit.depth}${anchor.stale ? " [stale]" : ""}`;
  });
  const tests = hits.filter((hit) => isTest(hit.node));
  // Depth is the shallowest, so depth 1 is a test calling a changed symbol itself.
  const testGroups = Object.entries({
    "Tests reached directly": tests.filter((hit) => hit.depth === 1),
    "Tests reached through other callers": tests.filter((hit) => hit.depth > 1),
  });
  for (const [heading, group] of testGroups) {
    if (group.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(...formatTestsReached(heading, group.map((hit) => hit.node)));
  }

  const hitNodes = hits.map((hit) => hit.node);
  return withFreshness(`${lines.join("\n")}\n`, [...targetNodes, ...hitNodes], hits.map((hit) => hit.edge));
}
