import type { GraphStore, NeighborResult } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";

export type NodeRole = "entry-point" | "hub" | "leaf" | "framework-mediated";

export interface NodeSignals {
  roles: NodeRole[];
  fanIn: number;
  fanOut: number;
  tested: boolean;
  frameworkMediated: boolean;
  isExported: boolean;
  coChangeScore: number;
  coverageKnown: boolean;
}

export interface SignalComputer {
  compute(nodeId: string, changedNodeIds?: string[]): NodeSignals;
}

const ROLE_ORDER: NodeRole[] = ["entry-point", "hub", "leaf", "framework-mediated"];
const IMPACT_ROLE_ORDER: NodeRole[] = ["leaf", "entry-point", "hub", "framework-mediated"];
// Memoization keys for changed symbol sets are normalized via sorted IDs.

function uniqueNeighborCount(neighbors: NeighborResult[]): number {
  return new Set(neighbors.map((neighbor) => neighbor.node.id)).size;
}

function hasFrameworkMediation(store: GraphStore, nodeId: string): boolean {
  return store.getNeighbors(nodeId).some((neighbor) => neighbor.edge.provenance.source === "ast-grep");
}

function sortRoles(roles: NodeRole[], order: NodeRole[]): NodeRole[] {
  return [...roles].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function parseGitCoChanges(evidence: string): number | null {
  const countMatch = evidence.match(/co_changes:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!countMatch?.[1]) return null;
  const count = Number(countMatch[1]);
  return Number.isNaN(count) ? null : Math.max(0, count);
}

function changedSetKey(changedNodeIds: string[]): string {
  if (changedNodeIds.length === 0) return "";
  return [...new Set(changedNodeIds)].sort().join("|");
}

export function createSignalComputer(store: GraphStore): SignalComputer {
  const moduleByFileCache = new Map<string, GraphNode | null>();
  const baseSignalsCache = new Map<string, Omit<NodeSignals, "coChangeScore">>();
  const changedModuleIdsCache = new Map<string, Set<string>>();
  const coChangeScoreCache = new Map<string, number>();
  const coverageKnown = store.hasCoverageData();

  function findModuleNode(node: GraphNode): GraphNode | null {
    const cached = moduleByFileCache.get(node.file);
    if (cached !== undefined) return cached;
    const byFile = store.getNodesByFile(node.file);
    const exact = byFile.find((candidate) => candidate.kind === "module" && candidate.name === node.file);
    const moduleNode = exact ?? byFile.find((candidate) => candidate.kind === "module") ?? null;
    moduleByFileCache.set(node.file, moduleNode);
    return moduleNode;
  }

  function computeChangedModuleIds(changedNodeIds: string[]): Set<string> {
    const key = changedSetKey(changedNodeIds);
    const cached = changedModuleIdsCache.get(key);
    if (cached) return cached;

    const ids = new Set<string>();
    for (const changedNodeId of changedNodeIds) {
      const changedNode = store.getNode(changedNodeId);
      if (!changedNode) continue;
      const moduleNode = findModuleNode(changedNode);
      if (moduleNode) ids.add(moduleNode.id);
    }

    changedModuleIdsCache.set(key, ids);
    return ids;
  }

  function computeCoChangeScore(node: GraphNode, changedNodeIds: string[]): number {
    if (changedNodeIds.length === 0) return 0;

    const setKey = changedSetKey(changedNodeIds);
    const cacheKey = `${node.id}::${setKey}`;
    const cached = coChangeScoreCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const nodeModule = findModuleNode(node);
    if (!nodeModule) {
      coChangeScoreCache.set(cacheKey, 0);
      return 0;
    }

    const changedModuleIds = computeChangedModuleIds(changedNodeIds);
    if (changedModuleIds.size === 0) {
      coChangeScoreCache.set(cacheKey, 0);
      return 0;
    }

    // Same-module candidates do not get an implicit boost; rely only on explicit co-change edges.

    const edges = [
      ...store.getNeighbors(nodeModule.id, { direction: "out", kind: "co_changes_with" }),
      ...store.getNeighbors(nodeModule.id, { direction: "in", kind: "co_changes_with" }),
    ];

    let maxScore = 0;
    for (const edge of edges) {
      if (!changedModuleIds.has(edge.node.id)) continue;
      const coChanges = parseGitCoChanges(edge.edge.provenance.evidence);
      if (coChanges === null) continue;
      maxScore = Math.max(maxScore, coChanges);
    }

    coChangeScoreCache.set(cacheKey, maxScore);
    return maxScore;
  }

  return {
    compute(nodeId: string, changedNodeIds: string[] = []): NodeSignals {
      const node = store.getNode(nodeId);
      if (!node) {
        return {
          roles: [],
          fanIn: 0,
          fanOut: 0,
          tested: false,
          frameworkMediated: false,
          isExported: false,
          coChangeScore: 0,
          coverageKnown: false,
        };
      }

      const cachedBase = baseSignalsCache.get(nodeId);
      const base = cachedBase ?? (() => {
        const fanIn = uniqueNeighborCount(store.getNeighbors(nodeId, { direction: "in", kind: "calls" }));
        const fanOut = uniqueNeighborCount(store.getNeighbors(nodeId, { direction: "out", kind: "calls" }));
        const tested = store.getNeighbors(nodeId, { direction: "out", kind: "tested_by" }).length > 0;
        const frameworkMediated = hasFrameworkMediation(store, nodeId);
        const isExported = Boolean(node.is_exported);

        const roles: NodeRole[] = [];
        if (isExported && node.kind !== "module" && fanIn === 0) roles.push("entry-point");
        if (fanIn >= 3 && fanOut >= 3) roles.push("hub");
        if (fanOut === 0) roles.push("leaf");
        if (frameworkMediated) roles.push("framework-mediated");

        const built = {
          roles: sortRoles(roles, ROLE_ORDER),
          fanIn,
          fanOut,
          tested,
          frameworkMediated,
          isExported,
          coverageKnown,
        };
        baseSignalsCache.set(nodeId, built);
        return built;
      })();

      return {
        ...base,
        roles: [...base.roles],
        coChangeScore: computeCoChangeScore(node, changedNodeIds),
      };
    },
  };
}

export function formatRoleTags(signals: NodeSignals): string {
  const coverageTag = signals.tested
    ? "tested"
    : signals.coverageKnown
      ? "untested"
      : "coverage-unknown";
  const tags = [...sortRoles(signals.roles, ROLE_ORDER), coverageTag];
  return `[${tags.join(", ")}]`;
}

export function formatImpactWhy(signals: NodeSignals, chainConfidence?: number): string {
  const roles = sortRoles(signals.roles, IMPACT_ROLE_ORDER);
  const rolesText = roles.length > 0 ? roles.join(",") : "none";
  const chainPart = typeof chainConfidence === "number"
    ? `, chain-confidence:${chainConfidence.toFixed(2)}`
    : "";
  const coverageText = signals.tested
    ? "tested"
    : signals.coverageKnown
      ? "untested"
      : "unknown";
  return `[fan-in:${signals.fanIn}, fan-out:${signals.fanOut}, roles:${rolesText}, coverage:${coverageText}, co-change:${signals.coChangeScore.toFixed(2)}${chainPart}]`;
}
