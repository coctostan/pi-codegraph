---
id: 11
type: feature
status: done
created: 2026-03-04T23:16:34.882Z
milestone: M2
priority: 3
---
# LSP edge resolution: go-to-definition and find-references
Use tsserver go-to-definition to resolve unresolved call edges (name-matched → fully resolved). Use find-references to discover callers missed by tree-sitter. Upgrade tree-sitter edges to lsp provenance with higher confidence. Resolve interface → implementation relationships.
