# Implementation Order — Tool Quality Issues

Issues #73–#82, batched as #83–#85. Derived from live tool analysis session (2026-04-20).

## Sequence

```
#84  →  #83  →  #75  →  #85  →  #78  →  #81  →  #82
```

| Step | Issue | What | Rationale |
|------|-------|------|-----------|
| 1 | **#84** | Interface handling batch | #77 (fix false-positive `implements` edges) must land before #74 (implements traversal). Do #77 first inside this batch, then #76 (interface contract signatures). |
| 2 | **#83** | `impact` core batch | #74 (implements traversal) now builds on clean edge data. Do #74 first, then #73 (empty-output messages) — messaging should reflect what's still empty *after* traversal is added. |
| 3 | **#75** | Trust header opt-out | Self-contained, no dependencies. Most visible friction once impact/symbol_graph are fixed and multi-tool usage increases. |
| 4 | **#85** | `trace` improvements batch | Independent of the above. Do #80 (error message) first (safe, no logic change), then #79 (class descent). |
| 5 | **#78** | Source truncation hint | Localized to `source.ts`, no dependencies. |
| 6 | **#81** | `maxDepth` in tool schema | Trivial schema addition. Worth doing after #83 is solid so the param has correct behavior to expose. |
| 7 | **#82** | Coverage signal distinction | Most architectural: new `GraphStore` method, store migration, signal logic changes. Also needs a real coverage run to validate. Do last. |

## Key Dependency

> **#77 must land before #74.** Everything else is priority order.

`#74` adds `implements` edge traversal to `impact`. `#77` removes false-positive `implements` edges from the graph. Traversing bad edges before fixing them amplifies incorrect data.

## Batch Contents

| Batch | Contains (in sub-order) |
|-------|------------------------|
| #83 | #74 → #73 |
| #84 | #77 → #76 |
| #85 | #80 → #79 |
