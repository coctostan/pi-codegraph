export type Phase5Tool =
  | "resolve_edge"
  | "delete_edge"
  | "graph_query"
  | "graph_overview"
  | "dead_code";

export type Phase5Decision = {
  surface: "public" | "dev";
  calls: number;
  decision: "keep" | "delete";
  evidence: string;
};

export const phase5ToolDecisions: Record<Phase5Tool, Phase5Decision> = {
  resolve_edge: {
    surface: "public",
    calls: 0,
    decision: "delete",
    evidence:
      "Zero agent calls in the 2026-04-17 through 2026-04-19 observation window. Matches the issue's zero-usage deletion rule for resolve_edge / delete_edge.",
  },
  delete_edge: {
    surface: "public",
    calls: 0,
    decision: "delete",
    evidence:
      "Zero agent calls in the 2026-04-17 through 2026-04-19 observation window. Paired with resolve_edge and cut under the same zero-usage rule.",
  },
  graph_query: {
    surface: "dev",
    calls: 0,
    decision: "delete",
    evidence:
      "Zero developer calls under CODEGRAPH_DEVMODE=1 in the observation window. symbol_graph / impact / trace covered every structural query.",
  },
  graph_overview: {
    surface: "dev",
    calls: 0,
    decision: "delete",
    evidence:
      "Zero developer calls under CODEGRAPH_DEVMODE=1 in the observation window. symbol_graph plus impact covered the hub / neighborhood questions it targeted.",
  },
  dead_code: {
    surface: "dev",
    calls: 0,
    decision: "delete",
    evidence:
      "Zero developer calls under CODEGRAPH_DEVMODE=1 in the observation window. Manual review plus impact covered the unreferenced-symbols question it targeted.",
  },
};

export function isRemoved(name: Phase5Tool): boolean {
  return phase5ToolDecisions[name].decision === "delete";
}

export const removedMutatingTools = (["resolve_edge", "delete_edge"] as const).filter((name) =>
  isRemoved(name),
);

export const removedDevTools = (["graph_query", "graph_overview", "dead_code"] as const).filter(
  (name) => isRemoved(name),
);

export const expectedDefaultPublicTools = [
  "symbol_graph",
  "impact",
  "trace",
  ...(["resolve_edge", "delete_edge"] as const).filter((name) => !isRemoved(name)),
];

export const expectedDevModeTools = (["graph_query", "graph_overview", "dead_code"] as const).filter(
  (name) => !isRemoved(name),
);

export const expectedDefaultPublicToolDescriptions = new Map<string, string>([
  ["symbol_graph", "Summarize a symbol with relationships, tests, and key metadata."],
  ...(!isRemoved("resolve_edge")
    ? ([
        ["resolve_edge", "Add an evidence-backed relationship to the symbol graph."],
      ] as const)
    : ([] as const)),
  ...(!isRemoved("delete_edge")
    ? ([
        ["delete_edge", "Delete an agent-created graph relationship."],
      ] as const)
    : ([] as const)),
  ["impact", "Classify blast radius for changed symbols."],
  ["trace", "Return an execution path from an entry point, coverage-backed when available."],
]);
