# Spec: M9 Agent Ergonomics — Overview, Dead Code, Token Tracking

## Goal

Add three agent-ergonomics features: a `graph_overview` onboarding tool that orients agents in unfamiliar repos, a `dead_code` detection tool that finds unreferenced symbols, and per-call token savings tracking across all tool responses to quantify the value codegraph provides.

## Acceptance Criteria

### graph_overview tool (#053)

**AC 1.** `graph_overview` is a registered read-only tool that accepts no required parameters and returns structured text output.

**AC 2.** Output includes a "Symbols" section with counts per node kind (function, class, interface, module, endpoint, test).

**AC 3.** Output includes a "Hub Symbols" section listing the top 10 symbols by total edge count (in + out), showing name, kind, file, and degree.

**AC 4.** Output includes a "Most-Imported Files" section listing the top 10 files by inbound import edge count, showing file path and import count.

**AC 5.** Output includes a "Files" section showing total indexed file count and stale file count.

**AC 6.** Output includes a "Suggested Queries" section with `graph_query` recipe strings. Recipes are conditional — only edge-kind-specific queries appear if that edge kind exists in the graph (e.g., `routes_to` recipes only if route edges exist).

**AC 7.** Output includes the standard trust header (via `prependTrustHeader`).

**AC 8.** When the graph is empty (no nodes), `graph_overview` returns a meaningful "empty graph" message rather than crashing.

### Dead code tool (#054)

**AC 9.** A new `dead_code` tool is registered as read-only. It accepts optional params: `name` (string), `file` (string), `kind` (node kind filter), `glob` (file glob filter).

**AC 10.** **Single symbol mode** (when `name` is provided): returns whether the symbol has inbound references, the reference count, and a list of referencing symbols (name, kind, file, edge kind) for all inbound edge types.

**AC 11.** Single symbol mode uses the standard ambiguity handling — if multiple nodes match, returns a disambiguation list. If none match, returns "not found".

**AC 12.** **Sweep mode** (when `name` is omitted): returns all exported symbols (`is_exported = true`) with zero inbound edges, showing name, kind, and file for each.

**AC 13.** Sweep mode results are filterable by `kind` (e.g., only functions) and `glob` (e.g., only `src/tools/*`).

**AC 14.** Sweep mode returns results sorted by file path then symbol name.

**AC 15.** Dead code tool output includes the standard trust header.

### Token savings tracking (#055)

**AC 16.** A `token-tracker` module exposes: `estimateNaiveCost(files, projectRoot)` → estimated token count (file sizes summed, divided by 4); `trackCall(toolName, naiveTokens, actualTokens)` → void; `getSessionStats()` → accumulated stats; `resetSession()` → void.

**AC 17.** Every tool response (`symbol_graph`, `symbol_card`, `symbol_contract`, `trace`, `impact`, `graph_query`, `graph_overview`, `dead_code`) appends a `_meta` line to its text output with: `tokens_saved` (naive − actual), `naive_tokens`, `actual_tokens`.

**AC 18.** The `_meta` line also includes running session totals: `session_calls` and `session_tokens_saved`.

**AC 19.** Naive cost estimation per tool: `symbol_graph` / `symbol_card` / `symbol_contract` = sum of file sizes for files containing returned/neighbor symbols. `trace` = sum of files in the traced path. `impact` = sum of downstream files. `graph_query` = sum of files for matched nodes. `graph_overview` / `dead_code` = total indexed file sizes.

**AC 20.** Token conversion uses 4 chars per token (integer division).

**AC 21.** Session state resets when `resetStoreForTesting()` is called (existing test hook).

**AC 22.** `resolve_edge` and `delete_edge` (write tools) do NOT get token tracking — they don't reduce reading.

## Out of Scope

- **D1.** Content-scan-based reference detection for dead code (grep in non-indexed files). Graph edges only for v1.
- **D2.** Token savings breakdown by tool type in session stats.
- **O1.** Standalone `get_session_stats` tool — session totals are included in every response's `_meta` line instead.
- **O2.** Dead code sweep `limit` parameter — can be added later if output is too large.

## Open Questions

None.

## Requirement Traceability

- `R1` → AC 2
- `R2` → AC 3
- `R3` → AC 4
- `R4` → AC 5
- `R5` → AC 6
- `R6` → AC 10, AC 11
- `R7` → AC 12, AC 13, AC 14
- `R8` → AC 17, AC 19, AC 20
- `R9` → AC 18
- `R10` → AC 1, AC 7, AC 8
- `O1` → Out of Scope (session totals in `_meta` line instead)
- `O2` → Out of Scope
- `D1` → Out of Scope
- `D2` → Out of Scope
- `C1` → AC 1, AC 9 (read-only, no new indexing)
- `C2` → AC 20
- `C3` → AC 17
- `C4` → AC 1, AC 9
- `C5` → AC 16, AC 21
