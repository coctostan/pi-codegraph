import type { GraphStore, NeighborResult } from "../graph/store.js";

export type NodeRole = "entry-point" | "hub" | "leaf" | "framework-mediated";

export interface NodeSignals {
  roles: NodeRole[];
  fanIn: number;
  fanOut: number;
  tested: boolean;
  frameworkMediated: boolean;
  isExported: boolean;
  coverageKnown: boolean;
}

export interface SignalComputer {
  compute(nodeId: string): NodeSignals;
}

const ROLE_ORDER: NodeRole[] = ["entry-point", "hub", "leaf", "framework-mediated"];

function uniqueNeighborCount(neighbors: NeighborResult[]): number {
  return new Set(neighbors.map((neighbor) => neighbor.node.id)).size;
}

function hasFrameworkMediation(store: GraphStore, nodeId: string): boolean {
  return store.getNeighbors(nodeId).some((neighbor) => neighbor.edge.provenance.source === "ast-grep");
}

function sortRoles(roles: NodeRole[], order: NodeRole[]): NodeRole[] {
  return [...roles].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function createSignalComputer(store: GraphStore): SignalComputer {
  const baseSignalsCache = new Map<string, NodeSignals>();
  const coverageKnown = store.hasCoverageData();
  return {
    compute(nodeId: string): NodeSignals {
      const node = store.getNode(nodeId);
      if (!node) {
        return {
          roles: [],
          fanIn: 0,
          fanOut: 0,
          tested: false,
          frameworkMediated: false,
          isExported: false,
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

      return { ...base, roles: [...base.roles] };
    },
  };
}

// Null when no coverage report was indexed, even over tested_by edges an earlier report left:
// the Trust block says so once instead of every line.
function coverageTag(signals: NodeSignals): string | null {
  if (!signals.coverageKnown) return null;
  return signals.tested ? "tested" : "untested";
}

/** `[roles, coverage]`, or "" when the node has neither. */
export function formatRoleTags(signals: NodeSignals): string {
  const coverage = coverageTag(signals);
  const tags = [...sortRoles(signals.roles, ROLE_ORDER), ...(coverage ? [coverage] : [])];
  return tags.length > 0 ? `[${tags.join(", ")}]` : "";
}
