---
id: 53
type: feature
status: done
created: 2026-03-24T18:17:44.920Z
priority: 2
---
# Graph overview / onboarding discovery tool
Inspired by jCodeMunch's `suggest_queries` tool. When an agent hits an unfamiliar repo, it needs a "what should I ask?" entry point.

Add a `graph_overview` tool (or mode) that returns:
- Node kind distribution (functions, classes, interfaces, etc.)
- High-degree symbols (most connected — likely core abstractions)
- Most-imported files (highest in-degree on import edges)
- File count and language stats
- Example graph_query recipes tailored to what's in the index

This is the recommended first tool call in a session. All the data already exists in the graph — just needs a dedicated surface.
