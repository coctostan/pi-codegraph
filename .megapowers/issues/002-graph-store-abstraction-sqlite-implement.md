---
id: 2
type: feature
status: done
created: 2026-03-04T23:16:15.466Z
milestone: M0
priority: 1
---
# Graph store abstraction + SQLite implementation
Define the graph store interface (addNode, addEdge, getNode, getNeighbors, query, etc.). Implement it with SQLite (bun:sqlite or better-sqlite3). Tables: `nodes` (id, kind, name, file, line, content_hash) and `edges` (source, target, kind, provenance, confidence, evidence, content_hash, created_at). Include schema migrations.
