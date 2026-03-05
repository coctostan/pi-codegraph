---
id: 20
type: feature
status: done
created: 2026-03-05T00:48:16.728Z
sources: [4, 5]
---
# M0: Tree-sitter indexer + incremental hashing
Build the Stage 1 indexer using tree-sitter to extract symbols and edges from TypeScript files (#004), then layer on incremental indexing with content hashing so re-runs only process changed files (#005).
