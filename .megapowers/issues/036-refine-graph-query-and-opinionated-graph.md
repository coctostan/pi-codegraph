---
id: 36
type: feature
status: in-progress
created: 2026-03-11T14:27:08.984Z
priority: 3
---
# Refine graph_query and opinionated graph inspection UX for agent workflows
## Goal
Make ad hoc graph inspection more useful to coding agents, while avoiding overinvestment in a query interface that may not be the highest-value primitive.

## Motivation
`graph_query` is useful, but likely secondary to strong opinionated tools such as `symbol_graph`, `impact`, and `trace`. The next phase should improve graph inspection ergonomics in a way that serves agent workflows, not query-language completeness for its own sake.

## Candidate scope
- improve the practical subset of supported graph queries where it materially helps agent workflows
- add or refine opinionated inspection patterns/helpers if they outperform raw query writing
- clarify the contract of supported query syntax vs unsupported Cypher features
- bias UX toward the most common agent tasks: finding related symbols, follow-up reads, and bounded explorations

## Success criteria
An agent should be able to inspect the graph with low friction and low surprise, using either:
- a better-scoped `graph_query`, or
- stronger opinionated alternatives

with the design decision driven by actual agent usefulness rather than theoretical expressiveness.

