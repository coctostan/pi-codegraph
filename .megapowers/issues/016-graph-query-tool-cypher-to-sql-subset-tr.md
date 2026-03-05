---
id: 16
type: feature
status: open
created: 2026-03-04T23:16:59.992Z
milestone: M5
priority: 4
---
# `graph_query` tool: Cypher-to-SQL subset translator
Implement the `graph_query` tool. Accept a subset of Cypher syntax, translate to SQL against the SQLite graph store. Support: node matching by kind/name, edge traversal by kind, WHERE filters, RETURN projections, LIMIT. Output anchored results.
