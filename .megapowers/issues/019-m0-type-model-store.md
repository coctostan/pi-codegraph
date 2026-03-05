---
id: 19
type: feature
status: done
created: 2026-03-05T00:48:16.726Z
sources: [3, 2]
---
# M0: Type model + store
Foundation layer: define the full TypeScript type model for nodes, edges, and provenance (#003), then implement the GraphStore interface backed by SQLite (#002). Types must land first since the store implementation depends on them.
