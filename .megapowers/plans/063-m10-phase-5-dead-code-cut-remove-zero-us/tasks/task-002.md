---
id: 2
title: Record the telemetry window and materialize the decision matrix
status: approved
depends_on:
  - 1
no_test: true
files_to_modify:
  - .megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md
files_to_create:
  - test/phase5-decision-matrix.ts
---

### Task 2: Record the telemetry window and materialize the decision matrix [no-test] [depends: 1]

**Covers:** AC3, AC4

**Justification:** external telemetry and pick-rate evidence are required inputs, not product behavior. This task captures that evidence in a durable artifact and a typed helper so every later keep/delete task reads the same observed counts and decisions.
**Files:**
- Modify: `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md`
- Create: `test/phase5-decision-matrix.ts`

**Step 1 — Make the change**
Append a `## Telemetry window and decisions` section to `summary.md` with the **actual** externally supplied data:
```md
## Telemetry window and decisions
- Observation window: <real start/end dates or duration>
- Phase 3 re-check: <real result showing structural-question pick-rate increased after Phase 3, or an explicit stop-the-line note if it did not>
| Tool | Surface | Calls in window | Decision | Evidence note |
| --- | --- | ---: | --- | --- |
| resolve_edge | public | <real count> | <keep/delete> | <why> |
| delete_edge | public | <real count> | <keep/delete> | <why> |
| graph_query | dev | <real count> | <keep/delete> | <why> |
| graph_overview | dev | <real count> | <keep/delete> | <why> |
| dead_code | dev | <real count> | <keep/delete> | <why> |
```

Then create `test/phase5-decision-matrix.ts` as the single test-side source of truth for those decisions:

```ts
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
  resolve_edge: { surface: "public", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
  delete_edge: { surface: "public", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
  graph_query: { surface: "dev", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
  graph_overview: { surface: "dev", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
  dead_code: { surface: "dev", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
};
export function isRemoved(name: Phase5Tool): boolean {
  return phase5ToolDecisions[name].decision === "delete";
}
export const removedMutatingTools = (["resolve_edge", "delete_edge"] as const).filter((name) =>
  isRemoved(name),
);
export const removedDevTools = (["graph_query", "graph_overview", "dead_code"] as const).filter((name) =>
  isRemoved(name),
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
    ? [["resolve_edge", "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs."]]
    : []),
  ...(!isRemoved("delete_edge")
    ? [["delete_edge", "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete."]]
    : []),
  [
    "impact",
    "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code.",
  ],
  [
    "trace",
    "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.",
  ],
]);
```

Replace every `/* real ... */` placeholder with the actual telemetry-backed values before saving the file. Do not leave placeholder comments in the committed artifact.
**Step 2 — Verify**
Run:
```bash
if grep -R "real count\|real decision\|real note\|<real" \
  .megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md \
  test/phase5-decision-matrix.ts; then
  echo 'placeholders remain'
  exit 1
fi
bun -e 'import { phase5ToolDecisions, expectedDefaultPublicTools, removedMutatingTools, removedDevTools } from "./test/phase5-decision-matrix.ts"; if (Object.keys(phase5ToolDecisions).length !== 5) throw new Error("phase5ToolDecisions must contain 5 tools"); console.log(expectedDefaultPublicTools.length, removedMutatingTools.length, removedDevTools.length);'
```
Expected: the grep step prints nothing, the Bun import step exits 0, and the final line prints three integers for the default-public count, removed-mutating count, and removed-dev count.
