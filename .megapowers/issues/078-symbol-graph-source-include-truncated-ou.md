---
id: 78
type: bugfix
status: open
created: 2026-04-20T10:32:55.992Z
priority: 3
---
# symbol_graph source include: truncated output gives no token count or continuation path
## Problem

When `include: ["source"]` is used on a large function, the source section silently truncates:

```
97:c5da|      coChangeScoreCache.set(cacheKey, 0);
(71 more lines truncated)
```

There is no:
- Token count of what was omitted
- Suggested offset/limit to read the rest
- Reference to the file anchor so the agent can use the `read` tool directly

The agent is left without a clear next step.

## Expected output

Replace the bare truncation notice with:

```
(71 more lines — use read("src/output/signals.ts", offset: 98, limit: 71) to see the rest)
```

Or embed the file path and start line so the agent can form the read call without a second lookup.

## Location

- `src/output/source.ts` — `readSourceSnippet` (line 21) — this is where the truncation limit is applied and the notice is generated
- The function has access to `file`, `startLine`, and the total line count; use these to generate the continuation hint

## Acceptance criteria

- Truncated source includes a `read(file, offset: N)` hint pointing to the first omitted line
- Non-truncated source output is unchanged
- The hint is a single line and doesn't add significant token overhead
