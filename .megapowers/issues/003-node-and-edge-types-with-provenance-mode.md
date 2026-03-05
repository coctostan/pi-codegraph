---
id: 3
type: feature
status: done
created: 2026-03-04T23:16:15.466Z
milestone: M0
priority: 1
---
# Node and edge types with provenance model
Define TypeScript types for graph nodes (function, class, interface, module, endpoint, test) and edges (calls, imports, implements, tested_by, co_changed, renders, routes_to). Every edge carries provenance: source layer (tree-sitter, lsp, ast-grep, coverage, git, agent), confidence (0-1), evidence string, content_hash for staleness detection.
