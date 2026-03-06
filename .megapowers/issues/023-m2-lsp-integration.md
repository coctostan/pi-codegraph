---
id: 23
type: feature
status: in-progress
milestone: M2
priority: 3
created: 2026-03-05T00:48:16.732Z
sources: [10, 11]
---
# M2: LSP integration
Spawn and manage tsserver as a long-lived child process with lazy on-demand querying (#010), then use it for go-to-definition and find-references to upgrade unresolved tree-sitter edges to fully-resolved LSP edges (#011).
