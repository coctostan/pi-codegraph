---
id: 9
type: feature
status: open
created: 2026-03-04T23:16:27.257Z
milestone: M1
priority: 2
---
# Pi extension wiring: register tools and handle invocations
Wire up as a pi extension. Register `symbol_graph` and `resolve_edge` as tools in index.ts. Handle tool invocations, parse arguments, route to implementations, return formatted output. Auto-index on first tool call if graph is empty.
