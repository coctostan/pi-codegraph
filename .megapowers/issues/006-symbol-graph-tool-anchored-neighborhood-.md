---
id: 6
type: feature
status: open
created: 2026-03-04T23:16:27.255Z
milestone: M1
priority: 2
---
# `symbol_graph` tool: anchored neighborhood query
Implement the `symbol_graph` tool. Given a symbol name (+ optional file), return its neighborhood: callers, callees, imports, implementors. Each node anchored to file:line:hash. Include unresolved edges with candidate suggestions. Respect token budget via result ranking (top N by confidence, show omission count).
