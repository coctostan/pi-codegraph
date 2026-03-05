---
id: 13
type: feature
status: open
created: 2026-03-04T23:16:43.529Z
milestone: M3
priority: 3
---
# Stage 3 indexer: ast-grep framework rule engine
Build the ast-grep indexing stage. Load framework pattern rules from bundled YAMLs + user-defined rules from project config. Bundled rules: Express route definitions → endpoint nodes + routes_to edges, React component renders → renders edges. Create endpoint nodes from matched patterns.
