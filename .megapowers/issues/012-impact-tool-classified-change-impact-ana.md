---
id: 12
type: feature
status: open
created: 2026-03-04T23:16:43.529Z
milestone: M3
priority: 3
---
# `impact` tool: classified change impact analysis
Implement the `impact` tool. Given changed symbols, traverse dependents and classify: breaking (signature change — arity, param types, return type), behavioral (body change, callers affected), safe (no downstream impact). Propagate transitively with depth tracking. Output anchored list of affected symbols with classification.
