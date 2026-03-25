---
id: 57
type: feature
status: in-progress
created: 2026-03-24T18:17:44.921Z
priority: 3
---
# Inline source snippets in symbol_card output
Inspired by jCodeMunch's `get_context_bundle` which returns symbol implementation + import context together. Currently `symbol_card` returns anchors (file:line:hash) but the agent must then `read()` each file separately to see actual code.

Add an `include_source: true` option (or make it default) on `symbol_card` that inlines the hashlined source for:
- The symbol's own definition (already anchored)
- Key neighbors (top callers/callees by confidence)

This turns symbol_card from "here's where to look" into "here's what you need" — fewer round-trips, less token waste on full file reads. Respect a token budget parameter to avoid blowing up large symbols.
