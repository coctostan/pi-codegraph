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
  [
    "symbol_graph",
    "Return a compact symbol summary with relationships, test signals, and key metadata.\nWhen to use: You need structural context for a named symbol.",
  ],
  ...(!isRemoved("resolve_edge")
    ? ([
        [
          "resolve_edge",
          "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs.",
        ],
      ] as const)
    : ([] as const)),
  ...(!isRemoved("delete_edge")
    ? ([
        [
          "delete_edge",
          "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete.",
        ],
      ] as const)
    : ([] as const)),
  [
    "impact",
    "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code.",
  ],
  [
    "trace",
    "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.",
  ],
]);
