## [Unreleased]

### Added
- Conditional Trust header: fresh read-only tool calls no longer emit `## Trust` header; non-fresh statuses (`stale`, `mixed`, `heuristic`, `runtime-backed`) still render the full header (#059)
- `CODEGRAPH_DEVMETA` env flag gates the `_meta: tokens_saved` footer on all read-only tools; reads env per call so toggling mid-session takes effect immediately (#059)
- `docs/tool-descriptions.md`: style guide codifying the one-terse-line + optional `When to use:` description pattern for all registered tools (#060)
- Normalized descriptions for all 11 registered tools in `src/index.ts` — no inline examples, no cross-tool references, no parameter restatement (#060)
- `README.md` and `ARCHITECTURE.md` now accurately list all 11 registered tools and point to the description style guide (#060)

### Added
- Type signature extraction from tree-sitter AST: `GraphNode.signature` field, SQLite `signature TEXT` column with migration, and extraction for functions, arrow functions, classes, and interfaces including generics, heritage clauses, and constructor params (#048)
- `symbol_card` tool: compact symbol summary with definition, signature, tests, relationships, and signals in one call (#049)
- `symbol_contract` tool: behavioral contract extraction — surfaces what a symbol takes, returns, throws, guard preconditions, and test-evidenced behaviors in one call. Includes on-demand tree-sitter extraction for throw statements, guard patterns, and test assertion mining (#050)
- M8 milestone (Contracts and Symbol Cards) delivered as batch — all three features integrated and verified (#051)
- PTC metadata on read-only tools (`symbol_graph`, `impact`, `trace`, `graph_query`, `symbol_card`, `symbol_contract`) for `code_execution` runtime exposure (#052)
- `symbol_card` now inlines hashlined source snippets and neighbor type signatures — eliminates follow-up `read()` round-trips. Supports `maxSourceLines` parameter (default: 50) with stale detection and graceful degradation (#057)

### Fixed
- `trace` static mode now visits all reachable callees via DFS instead of following one arbitrary branch (#041)

### Added
- Project scaffold: `package.json`, `tsconfig.json`, pi extension entrypoint, placeholder modules for graph store, indexer, tools, and output layer, plus working `bun test` and `tsc --noEmit` pipeline (#001)
- M0 type model: `NodeKind`, `EdgeKind`, `ProvenanceSource` string-literal unions; `GraphNode`, `GraphEdge`, `Provenance` interfaces; `nodeId()` helper — invalid assignments are TypeScript compile errors (#019, closes #003)
- M0 graph store: `GraphStore` interface (addNode, addEdge, getNode, getNeighbors, getNodesByFile, deleteFile, getFileHash, setFileHash, close) and `SqliteGraphStore` implementation backed by `bun:sqlite` with full schema, upsert semantics, transactional `deleteFile`, and schema versioning (#019, closes #002)
- M0 tree-sitter indexer: `extractFile()` parses `.ts` files via tree-sitter to extract function/class/interface/module nodes and `imports`/`calls` edges with tree-sitter provenance; `indexProject()` provides incremental indexing with SHA-256 content hashing (skip unchanged, re-index changed, remove deleted files) (#020, closes #004 #005)
- M1 output layer: `computeAnchor` (hashline anchoring with staleness detection), `rankNeighbors` (confidence + recency sort with truncation), `formatNeighborhood` (plain-text section formatter with stale markers and omission counts) — shared infrastructure for all graph tools (#021, closes #007)
- M1 `symbol_graph` tool: `symbolGraph()` queries a symbol by name, returns disambiguation list for ambiguous names or a ranked, hashline-anchored neighborhood (callers, callees, outgoing imports, unresolved) with per-category truncation to `limit` (#021, closes #006)
- `GraphStore.findNodes(name, file?)`: name-based symbol lookup, optionally scoped to a file (#021)
- M2 LSP integration: `TsServerClient` with lazy spawn, idle timeout, crash recovery, request serialisation, and per-request timeout; eager LSP index stage upgrades `__unresolved__` call edges to go-to-definition–confirmed `lsp` edges (confidence 0.9); lazy resolver in `symbol_graph` discovers missed callers via `find-references` and resolves interface implementations; tree-sitter evidence now stores `name:line:col`; `GraphStore` extended with `getUnresolvedEdges`, `getEdgesBySource`, `deleteEdge` (#023, closes #010 #011)

- M3 `impact` tool: BFS traversal of inbound `calls` edges with depth-aware classification (`breaking` / `behavioral`) for `signature_change`, `removal`, `behavior_change`, and `addition` change types; hashline-anchored output; cyclic-graph safe (#024, closes #012)
- M3 Stage 3 ast-grep indexer: declarative YAML rule engine loads bundled + project-local rules, invokes `sg` CLI subprocess, creates `endpoint` nodes and `routes_to` edges from Express route patterns, and `renders` edges from React self-closing JSX patterns using `enclosing_function` context resolution; fully incremental (changed-files only, stale-edge cleanup via `deleteFile`) (#024, closes #013)
- TSX file support: tree-sitter indexer now parses `.tsx` files using the `tsx` grammar, enabling Stage 3 React component analysis (#024)
- Graph schema: `endpoint` node kind, `routes_to` and `renders` edge kinds, `ast-grep` provenance source (#024)

- M4 Stage 4 V8 coverage indexer: parses V8 coverage JSON reports, maps function ranges to graph nodes, creates `tested_by` edges with `coverage` provenance, and persists deterministic ordered test traces with content-hash staleness tracking; incremental and malformed-entry-safe (#025, closes #014)
- M4 `trace` tool: returns one deterministic hashline-anchored execution path for any test, production symbol, or endpoint; prefers coverage-backed traces when available, falls back to static call-graph traversal; marks stale/unresolved steps gracefully (#025, closes #015)
- Graph schema: `test_trace_steps` table for persisted coverage traces; `saveTestTrace`/`getTestTrace` on `GraphStore` interface (#025)
- Graph schema: `endpoint` node kind, `routes_to` and `renders` edge kinds, `ast-grep` provenance source (#024)

- M5 `graph_query` tool: Cypher subset parser, parameterized SQL compiler, and hashline-anchored renderer; supports node matching by `kind`/`name`, directed edge traversal with optional alias, `WHERE` equality predicates (AND-joined), `RETURN` alias and property projections, and `LIMIT`; returns structured `parse_error`, `validation_error`, `unsupported_error`, and `execution_error` results; query values are always bound parameters, never interpolated; mutation keyword detection strips string literals to avoid false positives; `queryRows<T>` added to `GraphStore` with SELECT-only runtime guard (#026, closes #016)

### Fixed
- `runScan()` no longer throws `JSON Parse error: Unexpected EOF` when `sg run --json` returns exit code `1` with empty stdout (CI no-match condition); empty and whitespace-only subprocess output is now normalized to `[]` before parsing, keeping malformed non-empty JSON errors intact; regression tests added at both the subprocess boundary (`runScan` with injected `ExecFn`) and the `indexProject` integration level (#028)

### Added
- M5 Stage 5 git co-change indexer: parses `git log` commit history to find file pairs that frequently change together; emits `co_changes_with` module→module edges with exponential-decay recency weighting, configurable minimum threshold (default 2), and evidence carrying co-change count, recency score, and window; incremental via HEAD-hash caching (skips when HEAD unchanged, clears and rebuilds on HEAD change); gracefully no-ops in non-git directories and repos with no commits (#027, closes #017)
- M5 tree-sitter indexer hardening: aliased imports (`import { foo as bar }`) now extract the original name and resolve `bar()` calls to `foo`; namespace imports (`import * as ns`) emit `imports *` edges and resolve `ns.method()` calls to `method`; re-exports (`export { foo } from "./bar"` and `export { foo as baz }`) emit import edges targeting the original exported name enabling transitive barrel resolution; dynamic imports (`import("./mod")`) emitted as `imports` edges with confidence 0.3 (#027, closes #018)
- Pipeline timing instrumentation: `IndexResult` gains `timings: Record<string, number>` with per-stage wall-clock durations in milliseconds for all 5 stages (tree-sitter, lsp, ast-grep, coverage, git) (#027)
- `getStatistics(projectRoot?)` on `GraphStore` interface and `SqliteGraphStore`: returns node counts by kind, edge counts by kind+provenance, and file counts (total tracked, stale); staleness detection reads files from disk and compares SHA-256 hashes; sentinel keys (`__`-prefixed) are excluded from counts (#027)
- SQLite indexes `idx_nodes_name ON nodes(name)` and `idx_edges_kind ON edges(kind)` added to cover `symbol_graph` name lookups and `graph_query` kind filters (#027)

### Fixed
- Stale persisted graph data no longer served to tools: `ensureIndexed()` now calls `indexProject()` unconditionally instead of gating on an empty DB; incremental change detection (SHA-256 per file) ensures only changed files are re-indexed (#032, closes #029)
- `trace` and `impact` now return an explicit disambiguation list for ambiguous symbol names instead of reporting "not found" or silently aggregating all matches; shared `resolveUniqueSymbol()` helper unifies contract across all tools (#032, closes #030)
- `graph_query` now accepts single-quoted string literals in `WHERE` equality predicates (e.g. `WHERE n.name = 'GraphStore'`); previously only double-quoted values were accepted (#032, closes #031)

### Changed
- `trace` static fallback header changed from `mode: static` to `mode: static (heuristic, no runtime evidence)` so agents can distinguish runtime-backed paths from structural heuristics without inspecting step content; a shared `formatModeHeader()` helper now produces both coverage and static headers, preventing future drift (#033)
- `trace` tool description expanded to state that results may be coverage-backed or static heuristics, and to explain when agents should prefer `trace` versus `symbol_graph` and `impact` (#033)

### Added
- Shared node-signal layer (`src/output/signals.ts`): computes `fanIn`/`fanOut` (duplicate-provenance-safe), role tags (`entry-point`, `hub`, `leaf`), coverage tags (`tested`, `untested`, `framework-mediated`), co-change score from module-level git edges, and weakest-link chain confidence for `impact` traversal paths; memoized per-invocation for sub-second performance at 120+ dependents (#034)
- `is_exported` flag on `GraphNode`: extracted by tree-sitter from `export_statement` ancestry and persisted in SQLite (idempotent schema migration, NULL→false coercion) (#034)
- Always-on inline role-tag annotations in `symbol_graph`: resolved symbol header and resolved neighbor lines gain compact `[tag, ...]` suffixes; unresolved rows unchanged (#034)
- Always-on inline role-tag annotations in `trace`: every step line gains a compact `[tag, ...]` suffix; `mode:` header and step ordering preserved (#034)
- Always-on inline `why` annotations in `impact`: every result line ends with `[fan-in:<n>  <coverage>  co-change:<n>  chain-confidence:<v>]`; dependents are sorted by breaking→behavioral, fanIn desc, untested first, co-change desc, chain-confidence desc, depth asc, then file/name (#034)
- Performance regression test: 120-symbol in-memory `impact` with always-on signal annotations completes in under 1 second (#034)
- Shared trust/freshness header for all read-oriented tools: `symbol_graph`, `trace`, `impact`, and `graph_query` now prepend a compact 3-line `## Trust` header with `status` (fresh/stale/mixed/heuristic/runtime-backed), `evidence` (provenance sources), and `stale-files` count; existing row-level `[stale]` markers preserved; `resolve_edge` intentionally excluded; no new indexing stages (#035)
- Agent-friendly `graph_query` error recovery: all rejected queries now include a `try instead:` suggestion with a concrete working query; covers unsupported forms, parse errors, and validation errors (#036)
- WHERE `CONTAINS` and `STARTS WITH` operators: substring and prefix search in `graph_query` WHERE clauses, compiled to parameterized `LIKE` SQL (#036)
- Edge alias WHERE predicates: WHERE clauses now correctly resolve against edge aliases (e.g., `WHERE e.evidence = "ref"`) instead of only node aliases (#036)
- `graph_query` tool description now includes 5 working example queries for discoverability (#036)

### Fixed
- All tools no longer crash with `"attempt to write a readonly database"` under pi's extension runtime; `ensureIndexed()` catches indexing failures and degrades gracefully to stale graph data; `symbol_graph` lazy resolver survives readonly writes; `resolve_edge` returns a clear error message; read tools prepend `indexing-failed` trust note when degraded (#038)
- `rankNeighbors` no longer silently drops the last neighbor when called with a negative limit; negative values now fall back to the default of 10 while `limit=0` behavior is preserved (#037)
- `resolve_edge` now rejects self-referential edges where source and target resolve to the same node, preventing self-loops that pollute `symbol_graph` output (#037)
- `resolve_edge` now rejects empty or whitespace-only evidence strings, ensuring agent-written edges maintain auditable provenance (#037)
- `graph_query` execution errors now surface the actual SQLite error message (e.g., `no such column: n0.nonexistent_column`) instead of the generic `failed to execute compiled query`; agents can now diagnose and fix their queries (#045)
- `impact` now returns `Symbol "X" not found` diagnostic for non-existent symbols instead of an empty body (#042)
- `impact` now returns an explicit unsupported-operation message for `addition` change type instead of an empty body (#043)
- `getNeighbors` with direction `"both"` no longer returns duplicate entries for self-referential edges; dedup uses the edge composite primary key so distinct edges are preserved (#039)
- `symbol_graph` now renders all 8 edge kinds (implements, extends, tested_by, co_changes_with, renders, routes_to — previously only calls and imports) with direction-aware section titles; removed `renderImplementationsSuffix` bolt-on; `formatNeighborhood` refactored to accept generic named sections (#040)
- `delete_edge` tool: agents can now retract incorrect agent-authored edges from the graph; resolves source/target symbols, validates edge kind, checks for existing agent-provenance edge before deletion, and protects structural (non-agent) edges; registered alongside the existing 5 tools with readonly error handling (#044)