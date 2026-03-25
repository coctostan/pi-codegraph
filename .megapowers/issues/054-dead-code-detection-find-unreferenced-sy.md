---
id: 54
type: feature
status: done
created: 2026-03-24T18:17:44.920Z
priority: 2
---
# Dead code detection: find unreferenced symbols
Inspired by jCodeMunch's `check_references` tool. Answer "is this symbol used anywhere?" and "which symbols have zero inbound references?"

Two modes:
1. **Single symbol check** — given a symbol name, report whether it has any callers/importers/references. Combine import edges + calls edges + content scan.
2. **Sweep mode** — find all exported symbols with zero inbound edges (potential dead code). Filter by kind, file glob, etc.

We already have the edge data (calls, imports, tested_by). This is a query/aggregation layer on top of existing graph data. Could be a dedicated tool or a `graph_query` recipe, but a purpose-built tool with clear output (referenced: yes/no, reference count, reference list) is more agent-friendly.
