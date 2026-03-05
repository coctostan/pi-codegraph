---
id: 5
type: feature
status: open
created: 2026-03-04T23:16:15.467Z
milestone: M0
priority: 2
---
# Incremental indexing with content hashing
Track content hash per indexed file. On re-index, skip files whose hash hasn't changed. When a file changes, remove its old nodes/edges and re-extract. Mark edges referencing stale content hashes as potentially invalid.
