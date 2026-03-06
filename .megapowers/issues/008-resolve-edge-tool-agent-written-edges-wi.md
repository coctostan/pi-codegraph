---
id: 8
type: feature
status: done
created: 2026-03-04T23:16:27.256Z
milestone: M1
priority: 2
---
# `resolve_edge` tool: agent-written edges with evidence
Implement the `resolve_edge` tool. Agent provides: source symbol, target symbol, edge kind, evidence (free text explaining why). Store with provenance=agent, confidence based on evidence quality. Edges are invalidated when source file content hash changes. Allow overwriting existing unresolved edges.
