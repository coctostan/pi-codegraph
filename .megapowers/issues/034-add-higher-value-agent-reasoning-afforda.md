---
id: 34
type: feature
status: open
created: 2026-03-11T14:27:08.982Z
priority: 2
---
# Add higher-value agent reasoning affordances beyond structural graph edges
## Goal
Increase the real utility of pi-codegraph as an agent tool by augmenting structural graph data with more agent-useful reasoning surfaces.

## Motivation
The current tool is strongest at structural navigation and impact scoping, but weaker at helping an agent understand meaning, invariants, and why code matters. Even if current functionality bugs are fixed, the graph mostly answers "where should I look?" rather than "what matters here?"

## Candidate scope
- enrich nodes/edges with higher-signal summaries for agent consumption
- improve change-analysis output so it better prioritizes what to inspect/test next
- add more opinionated agent-facing views instead of relying on raw graph traversal alone
- capture and surface evidence that helps explain relationships, not just list them
- consider practical ways to bridge structural relationships with semantic context without overclaiming full understanding

## Success criteria
Agents should get more than adjacency information. They should get outputs that better support:
- change planning
- review scoping
- test targeting
- deciding what code to read next

This work should focus on actual reduction of search cost and uncertainty for coding agents.

