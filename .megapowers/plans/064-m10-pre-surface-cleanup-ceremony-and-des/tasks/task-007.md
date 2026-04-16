---
id: 7
title: Document the normalized tool surface
status: approved
depends_on:
  - 6
no_test: true
files_to_modify:
  - README.md
  - ARCHITECTURE.md
files_to_create:
  - docs/tool-descriptions.md
---

### Task 7: Document the normalized tool surface [depends: 6] [no-test]

**Justification:** Documentation-only changes: add the style guide, update README/ARCHITECTURE inventories, and reconcile tool-surface docs to the 11 registered tools. No runtime behavior changes.

**Files:**
- Create: `docs/tool-descriptions.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Step 1 — Make the change**
1. Create `docs/tool-descriptions.md` with this exact content:

```md
# Tool Description Style Guide

Tool descriptions exist to help the model decide whether to call a tool. Keep them short, action-oriented, and focused on the decision to reach for the tool.

## Rules
1. Start with one terse action-oriented line that says what the tool does or returns.
2. Add a `When to use:` block only when the trigger is not obvious from the first line.
3. Keep `When to use:` to 1-2 short lines.
4. Do not include inline examples in top-level tool descriptions.
5. Do not cross-reference other tool names from a description.
6. Do not restate parameters that the TypeBox schema already documents.

## Good
- `Return a symbol's callers, callees, tests, and key signals.`
  `When to use: You need structural context for a named symbol.`
- `Run a Cypher subset query against the graph.`
  `When to use: You need an ad hoc graph slice that is easier to express as a query.`

## Bad
- `Execute a Cypher subset query against the graph. Examples: MATCH ...`
- `Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.`
- `Find symbols by approximate name. Parameters: query, kind, file, limit.`

## Maintenance
`src/index.ts` is the source of truth for registered tools. When the tool surface changes, update this guide, `README.md`, and `ARCHITECTURE.md` together.
```

2. In `README.md`:
- Change the install paragraph so it says the extension exposes **11 tools**, not 8.
- Replace the `## Tools` section so it contains exactly these subsections, in registered order: `symbol_graph`, `resolve_edge`, `delete_edge`, `impact`, `trace`, `graph_query`, `symbol_card`, `symbol_contract`, `graph_overview`, `dead_code`, `symbol_search`.
- Use the approved first-line description text from `src/index.ts` for each subsection.
- Keep examples in README only; add short example blocks for the three missing sections:
  - `graph_overview({})`
  - `dead_code({})`
  - `symbol_search({ query: "validate token" })`

3. In `ARCHITECTURE.md`:
- Update the top `Tools:` line in the system overview diagram so it lists all 11 registered tools.
- Add this one-line pointer under `## Output Layer`:
  - `Tool description authoring rules live in docs/tool-descriptions.md.`
- Update the file-layout section so it lists the current tool files, including `delete-edge.ts`, `symbol-card.ts`, `symbol-contract.ts`, `graph-overview.ts`, `dead-code.ts`, and `symbol-search.ts`.
- Ensure any stale text that still implies an 8-tool or 5-tool surface is rewritten to match `src/index.ts`.

**Step 2 — Verify**
Run: `bun -e 'import { readFileSync } from "node:fs"; const read = (path) => readFileSync(path, "utf8"); const tools = ["symbol_graph", "resolve_edge", "delete_edge", "impact", "trace", "graph_query", "symbol_card", "symbol_contract", "graph_overview", "dead_code", "symbol_search"]; const readme = read("README.md"); const architecture = read("ARCHITECTURE.md"); const guide = read("docs/tool-descriptions.md"); for (const tool of tools) { if (!readme.includes(`### \`${tool}\``)) throw new Error(`README.md missing ${tool}`); if (!architecture.includes(tool)) throw new Error(`ARCHITECTURE.md missing ${tool}`); } if (!architecture.includes("docs/tool-descriptions.md")) throw new Error("ARCHITECTURE.md missing tool description guide pointer"); if (!guide.includes("When to use:")) throw new Error("docs/tool-descriptions.md missing style-guide rule text");' && bun test && bun run check`
Expected: success — docs contain the full 11-tool inventory, the style guide exists, the architecture doc points to it, and the test/typecheck suite stays green
