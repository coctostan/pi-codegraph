---
id: 58
type: feature
status: in-progress
created: 2026-03-24T18:38:42.122Z
sources: [53, 54, 55]
---
# M9: Agent ergonomics — overview, dead code, token tracking
First batch of agent ergonomics improvements inspired by jCodeMunch analysis. Focuses on three quick wins that query existing graph data in new ways:

1. **#053 Graph overview tool** — first-call onboarding: kind distribution, high-degree symbols, most-imported files, example queries
2. **#054 Dead code detection** — find unreferenced symbols (zero inbound edges), single-symbol check + sweep mode
3. **#055 Token savings tracking** — estimate tokens saved per tool call, accumulate session totals in `_meta`

All three build on existing graph data with minimal new infrastructure.
