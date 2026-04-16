---
id: 60
type: feature
status: open
created: 2026-04-16T15:01:36.274Z
milestone: M10
---
# M10 Phase 2: Normalize tool descriptions and reconcile README/code drift
## Goal

Make tool descriptions do one job consistently: **help the model decide whether to reach for the tool.** Kill inline examples, cross-references, and inconsistent styles.

## Context

Current descriptions are uneven:
- Some are one terse line (`symbol_graph`, `trace`) — but `trace` cross-references `symbol_graph` and `impact`, which is odd (by the time the model reads `trace`'s description it already picked `trace`).
- `impact`'s description is multi-line with inline examples that repeat what TypeBox schema already conveys.
- `graph_query`'s description embeds five example Cypher queries.
- The README says 8 tools; the code registers 11. Nobody owns the description system.

See `~/pi/workspace/thinkingspace/plans/codegraph-refocus-plan.md` — Phase 2.

## Style guide to codify

- **Single terse first line: "Do X when Y." Action-oriented.**
- Optional `When to use:` block (1–2 lines) only if the trigger isn't obvious from the first line.
- **No inline examples in descriptions.** Examples live in README / docs, not in every session's prompt.
- **No cross-references to other tools.** Each description stands alone.
- Parameters self-describe via TypeBox schema; don't repeat in top-level description.

Document the style guide in `ARCHITECTURE.md` (or a new `docs/tool-descriptions.md`) so future contributors don't regress.

## Concrete rewrites (baseline)

**`symbol_graph`**
- Before: "Look up a symbol and return its anchored neighborhood"
- After: "Return a symbol's callers, callees, tests, and key signals. Use when you need structural context for a named symbol."

**`trace`**
- Before: "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents."
- After: "Return the execution path starting from an entry point. Coverage-backed when available. Use when you need to understand what actually runs."

**`impact`**
- Before: multi-line with inline `impact({ ... })` examples.
- After: "Return the classified blast radius (breaking / behavioral / safe) for a set of changed symbols. Use before or during changes to existing code."

Apply the same style to all currently registered tools.

## Reconcile README/code drift

README lists 8 tools; `src/index.ts` registers 11. By the end of this issue:
- README lists exactly the tools that register in `src/index.ts`.
- `ARCHITECTURE.md` agrees.
- If docs reference tools that were never shipped or no longer exist, fix them.

## Exit criteria

- All registered tools' descriptions follow the style guide.
- README + `ARCHITECTURE.md` accurately list the tools the code registers.
- Style guide is documented for future contributors.
- All tests still pass.
