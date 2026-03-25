# Brainstorm: M9 Agent Ergonomics — Overview, Dead Code, Token Tracking

## Goal

Add three agent-ergonomics features to pi-codegraph: (1) a `graph_overview` tool that gives agents a "what should I ask?" entry point for unfamiliar repos, (2) a dead code detection tool that finds unreferenced symbols, and (3) token savings tracking in every tool response to quantify the value codegraph provides per call and per session.

## Mode

`Direct requirements` — all three features are well-scoped, the data layers already exist, and the behaviors are concrete. No design exploration needed.

## Must-Have Requirements

**R1.** A new `graph_overview` tool returns node kind distribution (functions, classes, interfaces, etc. with counts).

**R2.** `graph_overview` returns high-degree symbols (most connected by total in+out edges) — likely core abstractions.

**R3.** `graph_overview` returns most-imported files (highest in-degree on import edges).

**R4.** `graph_overview` returns file count and staleness stats.

**R5.** `graph_overview` returns example `graph_query` recipes tailored to what's actually in the index (e.g., only suggest Express route queries if route edges exist).

**R6.** A new dead code detection tool supports **single symbol mode**: given a symbol name (+ optional file), report whether it has any inbound references (callers, importers, tested_by, etc.), with reference count and reference list.

**R7.** The dead code tool supports **sweep mode**: find all exported symbols with zero inbound edges. Filterable by kind and/or file glob.

**R8.** Every existing tool response (`symbol_graph`, `symbol_card`, `symbol_contract`, `trace`, `impact`, `graph_query`) includes a `_meta.tokens_saved` estimate appended to the text output, comparing estimated naive cost (sum of file sizes the agent would have had to read) vs actual response size.

**R9.** Token savings accumulate across calls in a session. Running session totals (total calls, total tokens saved) are included in each response's metadata line.

**R10.** `graph_overview` is the recommended first tool call — its output should orient an agent that knows nothing about the repo.

## Optional / Nice-to-Have

**O1.** A standalone `get_session_stats` tool or mode that returns accumulated token savings and call counts without performing any other query.

**O2.** Dead code sweep mode supports a `limit` parameter to cap results.

## Explicitly Deferred

**D1.** Content-scan-based reference detection for dead code (grep for symbol name in non-indexed files). Stick to graph edges only for v1.

**D2.** Token savings broken down by tool type in session stats.

## Constraints

**C1.** All three features are read-only query/aggregation layers over existing graph data — no new indexing stages.

**C2.** Token estimation uses ~4 chars/token as conversion factor.

**C3.** Token metadata is appended as a structured text line in tool output (not a separate return channel) since pi tool responses are text-based.

**C4.** `graph_overview` and dead code tool follow the existing pattern: tool function in `src/tools/`, registered in `src/index.ts`, read-only.

**C5.** Session token accumulation uses the existing in-memory shared state pattern (like `sharedStore`), not a new persistence layer.

## Open Questions

None.

## Recommended Direction

**`graph_overview`** should be a new tool (`src/tools/graph-overview.ts`) that calls `store.getStatistics()` for the node/edge distribution, then runs targeted SQL queries for high-degree symbols (top N by total edge count) and most-imported files (top N by inbound import edges). The suggested queries section should check which edge kinds actually exist in the graph and only emit relevant recipes. Output is plain structured text, no hashline anchoring needed since this is summary data.

**Dead code detection** should be a new tool (`src/tools/dead-code.ts`) with a `name` param (optional) and `kind`/`glob` filter params. When `name` is provided, it runs single-symbol mode — find the node, count inbound edges, list references. When `name` is omitted, it runs sweep mode — query all exported nodes with zero inbound edges, filtered by the provided kind/glob. Both modes return structured text with symbol name, file, kind, and reference details.

**Token savings** should be a thin utility module (`src/tools/token-tracker.ts`) that exposes `estimateNaiveCost(files: string[], projectRoot: string)` (sums file sizes, divides by 4) and `trackCall(toolName, naiveTokens, actualTokens)` (accumulates session state). Each tool's execute wrapper in `index.ts` computes the estimate before calling the tool function, measures response size after, and appends a `_meta` line. Session state is a simple module-level object reset when the store resets.

## Testing Implications

- `graph_overview` tests: index a small fixture project, verify output contains correct node counts, high-degree symbols appear, import-heavy files appear, and suggested queries match present edge kinds.
- Dead code single-symbol mode: index fixtures with referenced and unreferenced symbols, verify correct yes/no and reference lists.
- Dead code sweep mode: verify only exported zero-inbound symbols appear, and kind/glob filters work.
- Token tracker unit tests: verify estimate calculation, session accumulation, and reset behavior.
- Integration tests: verify `_meta` lines appear in existing tool outputs with plausible values.
