---
id: 86
type: feature
status: done
created: 2026-04-30T17:43:34.174Z
priority: 1
---
# Add freshness and staleness reporting to graph outputs
## Problem

pi-codegraph answers are only useful for safe agent edits if the agent can tell whether the graph reflects the current working tree. A stale graph can actively mislead agents: `impact` may miss callers, `symbol_graph` may show outdated relationships, and `trace` may describe paths that no longer exist.

The tool already emphasizes trust/provenance, but freshness should become a first-class signal in every graph-backed response.

## Goal

Add compact, actionable freshness reporting to public tool outputs so agents know whether a result is safe to trust, stale, or partially stale.

## Proposed behavior

Every public graph-backed tool should include a concise freshness/trust line by default:

```text
Trust: fresh
```

When stale or uncertain, expand with actionable detail:

```text
Trust: stale — 2 changed files affect this result
- src/indexer/tree-sitter.ts hash mismatch since index
- affected symbols: extractSymbols, extractCalls
- impact may be incomplete; refresh index before relying on this result
```

For partially stale results:

```text
Trust: partial — target symbol is fresh, but 3 neighbor edges come from stale files
```

Existing `suppressTrustHeader` behavior should continue to allow repeated calls to omit the header after the agent has reviewed it.

## Scope

Implement freshness reporting for:

- `symbol_graph`
- `impact`
- `trace`

Freshness should consider:

- current file content hash vs indexed node/edge content hash
- source file existence/deletion
- indexed timestamp if available
- stale edges whose source evidence file has changed
- whether staleness affects the requested symbol/result, not just the project globally

## Acceptance criteria

- Fresh graph results render a compact one-line trust/freshness status.
- Stale graph results identify changed/deleted files relevant to the returned result.
- Stale results identify affected symbols when that can be determined.
- `impact` warns when stale dependencies may make blast-radius results incomplete.
- `trace` warns when stale call edges may make the execution path unreliable.
- `symbol_graph` distinguishes between a stale target symbol and stale neighborhood edges.
- `suppressTrustHeader: true` suppresses the freshness header consistently.
- Tests cover fresh, stale target file, stale neighbor edge, deleted file, and suppressed-header cases.

## Non-goals

- Do not build a full automatic reindex daemon in this issue.
- Do not add broad token/cost analytics.
- Do not add natural-language graph explanations.
- Do not change the public tool set unless needed for internal implementation.

## Suggested implementation notes

- Centralize freshness evaluation in the output or graph layer rather than duplicating logic per tool.
- Prefer a small typed result such as:

```ts
type FreshnessStatus = "fresh" | "partial" | "stale" | "unknown";

interface FreshnessReport {
  status: FreshnessStatus;
  staleFiles: string[];
  deletedFiles: string[];
  affectedSymbols: string[];
  staleEdgeCount: number;
  message: string;
}
```

- Reuse existing content-hash fields on nodes/edges where possible.
- Keep the default fresh output terse; spend tokens only when freshness is degraded.
- Make freshness computation result-scoped: only report files/edges relevant to the symbols and paths being returned.

## Why this matters

Freshness is foundational for agent safety. A stale code graph is worse than no graph because it can produce confident but incorrect impact and relationship answers. This issue strengthens the reliability of every existing public tool before adding larger features like graph reports or path traversal.
