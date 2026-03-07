---
id: 10
type: feature
status: done
created: 2026-03-04T23:16:34.882Z
milestone: M2
priority: 3
---
# Stage 2 indexer: tsserver spawning and lifecycle
Spawn tsserver as a child process. Manage lifecycle: start on demand, keep alive for batch queries, shut down on idle. Handle the JSON protocol for requests/responses. Lazy resolution: only query LSP for symbols that are actually queried by tools, not during bulk indexing.
