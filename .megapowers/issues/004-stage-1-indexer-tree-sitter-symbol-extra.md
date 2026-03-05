---
id: 4
type: feature
status: done
created: 2026-03-04T23:16:15.466Z
milestone: M0
priority: 1
---
# Stage 1 indexer: tree-sitter symbol extraction
Use tree-sitter to parse TypeScript files and extract symbol nodes: functions, classes, interfaces, modules (files). Extract import edges from import statements and direct call edges (name-matched, not resolved) from call expressions. Write all nodes and edges to the graph store with tree-sitter provenance.
