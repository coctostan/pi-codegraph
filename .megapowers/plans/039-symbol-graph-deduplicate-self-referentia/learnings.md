# Learnings — #039 Self-referential edge deduplication

- **Bidirectional union queries need dedup awareness.** Any `UNION ALL`-style concatenation of "out" + "in" queries will produce duplicates when source === target. This is a general pattern worth checking whenever direction="both" semantics exist.
- **The dedup key should match the DB primary key.** Using `(source, target, kind, provenance_source)` — the same composite key as the `edges` table PK — ensures only true duplicates are collapsed and legitimately different edges are preserved.
- **Other callers were incidentally safe.** All other `getNeighbors` consumers used explicit `"in"` or `"out"` directions, or consumed results in ways that tolerated duplicates (`.some()`, `Math.max`). Only `symbolGraph` used the default `"both"` and rendered results directly.
- **Store-level fixes are more robust than tool-level.** Fixing in `getNeighbors` protects all current and future consumers. The alternative (dedup in `symbolGraph`) would have left the store-level bug latent.
- **Existing codebase already had a dedup pattern.** `impact.ts` had `dedupeInboundByStrongestEdge()` — proof the team knew dedup was needed for neighbor queries, but it wasn't applied universally.
