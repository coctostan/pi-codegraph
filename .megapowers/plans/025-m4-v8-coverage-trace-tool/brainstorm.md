## Approach

M4 should be implemented as a normal extension of the existing indexing/query architecture rather than as a separate runtime subsystem. The recommended design is: raw V8 coverage JSON is ingested by a dedicated Stage 4 indexer, normalized into a deterministic intermediate representation, mapped back onto existing graph nodes by file and line-range overlap, and then persisted as graph-native artifacts. Those persisted artifacts are primarily `tested_by` edges with `coverage` provenance plus a minimal stored ordered symbol sequence per test for later trace reconstruction. The `trace` tool should query persisted artifacts first and only fall back to static traversal when no coverage-backed trace resolves.

For v1, the goal is usefulness with minimal moving parts. We are explicitly not building a general execution-event database, a test runner orchestration layer, or a multi-trace ranking UI. Raw coverage production is out of scope; ingestion starts from already-generated V8 JSON. The tool should return one deterministic best trace only. If multiple tests cover the same symbol, the system picks the first deterministic matching test trace rather than exposing many candidates.

This keeps the feature aligned with existing project principles: graph-first storage, provenance on every derived edge, incremental indexing, and structured output. Endpoint tracing is included only if it falls out naturally from existing `routes_to` edges; otherwise it is deferred. Stale coverage-backed traces remain useful, so they should still be returned when resolvable, but clearly marked stale.

## Key Decisions

- Use raw V8 coverage JSON as the only required v1 input artifact.
- Parse coverage during indexing, not inside the `trace` tool.
- Persist graph-native artifacts rather than reparsing raw JSON on every query.
- Create `tested_by` edges from production symbol -> test symbol with `coverage` provenance.
- Persist one ordered symbol sequence per test as the backing data for `trace`.
- Return one deterministic trace only in v1; no multi-trace mode.
- Prefer coverage-backed traces; fall back to static graph traversal only when no resolvable stored trace exists.
- Return stale coverage-backed traces if available, but mark them stale.
- Map coverage to symbols only by project-local file/range overlap; no cross-file guessing.
- Include endpoint support only if straightforward through existing `routes_to` relationships.

## Components

- **Stage 4 coverage parser**
  - Reads one or more V8 coverage JSON files from a known location.
  - Filters to project-local TypeScript/TSX files.
  - Produces normalized, deterministic coverage records.

- **Coverage-to-graph mapper**
  - Resolves normalized coverage ranges to existing graph nodes using file and line overlap.
  - Distinguishes test nodes from production nodes.
  - Drops unmapped ranges rather than guessing.

- **Coverage persistence layer**
  - Writes `tested_by` edges with `coverage` provenance.
  - Stores minimal ordered per-test symbol trace data for query-time retrieval.
  - Tracks enough hash/state to detect stale coverage-backed artifacts.

- **Trace resolver**
  - For a test symbol: returns its stored ordered trace.
  - For a production symbol or endpoint: finds one deterministic related test trace.
  - Falls back to one deterministic static trace when no coverage-backed trace is available.

- **Trace tool output formatter**
  - Formats anchored execution paths using existing anchoring behavior.
  - Marks stale trace results or stale anchors explicitly.
  - Keeps output structured and compact.

## Testing Strategy

Testing should focus on narrow, deterministic seams.

- **Parser unit tests** verify that raw V8 fixtures become normalized coverage records with stable ordering, project-local path filtering, and graceful handling of malformed entries.
- **Range mapping unit tests** verify coverage range -> symbol resolution, including exact matches, nested functions, no-match cases, and stale file-hash scenarios.
- **Stage 4 integration tests** verify that ingesting fixture coverage creates `tested_by` edges with `coverage` provenance and stores deterministic per-test trace sequences.
- **Trace tool tests** verify these scenarios:
  - test symbol input returns stored coverage-backed trace
  - production symbol input chooses one deterministic covering trace
  - endpoint input works when existing `routes_to` data makes it straightforward
  - stale coverage trace is returned with stale marking
  - no coverage-backed trace falls back to one deterministic static traversal
- Prefer fixture-driven tests over full end-to-end coverage execution in v1 to keep the suite stable and fast.
- Success for v1 is deterministic, anchored, symbol-level traces that are useful to agents even if runtime chronology is approximate rather than profiler-perfect.