# M2: LSP Integration — Brainstorm Summary

## Approach

The LSP integration adds Stage 2 indexing to pi-codegraph by spawning tsserver as a child process and using its JSON protocol to resolve symbols that tree-sitter can only name-match. This dramatically improves graph accuracy — unresolved `__unresolved__::name:0` phantom nodes get replaced with real file:line targets, and callers that tree-sitter missed are discovered.

The integration follows a **hybrid eager/lazy** model. During indexing, the LSP stage eagerly resolves all known `__unresolved__` edges via go-to-definition (cheap, targeted queries against known call sites). At tool invocation time, `symbol_graph` lazily calls find-references and implementations for the queried symbol to discover callers tree-sitter missed and resolve interface→implementation relationships. All LSP results are cached as `lsp`-provenance edges in the graph store — the graph itself is the cache, no separate layer needed.

Three new components share a single `TsServerClient` instance: the client itself (protocol handling, lifecycle), the LSP indexer stage (eager batch resolution in the pipeline), and the LSP resolver helper (lazy on-demand resolution from tools). The client spawns tsserver on first request and kills it after an idle timeout, automatically respawning on the next request.

## Key Decisions

- **tsserver child process over in-process LanguageService API** — process isolation, stable protocol, handles crashes gracefully, matches AGENTS.md design
- **Hybrid eager/lazy resolution** — eagerly resolve known unresolved edges during indexing (go-to-definition is cheap and targeted), defer find-references and implementations to tool invocation time (expensive, only pay for symbols the agent actually queries)
- **Lazy start + idle timeout for tsserver lifecycle** — spawn on first LSP query, kill after N seconds of inactivity, auto-respawn on next request. Covers both batch indexing (kept alive by rapid queries) and tool-time queries (respawns on demand) without wasting memory between sessions
- **Two integration points** — `src/indexer/lsp.ts` for the pipeline stage (eager), `src/indexer/lsp-resolver.ts` for the tool-time helper (lazy). Both use the same `TsServerClient`
- **Graph store is the cache** — LSP-resolved edges are regular edges with `lsp` provenance. No separate cache layer. Second query for the same symbol hits the graph, not tsserver
- **No tsserver mocking in tests** — the protocol is complex enough that mocks would be unreliable. Use a small fixture TypeScript project with real tsserver
- **Graceful degradation** — if tsserver can't start (no TypeScript installed, no tsconfig), the LSP stage is skipped. Graph stays at tree-sitter quality. No crash, no error surfaced to the agent
- **Serialized requests** — internal queue ensures one request at a time to tsserver. No concurrent access issues

## Components

### 1. `TsServerClient` (`src/indexer/tsserver-client.ts`)
Low-level wrapper around the tsserver child process. Manages:
- Spawning (lazy, on first call) — looks for `node_modules/.bin/tsserver` then global
- JSON protocol: request IDs, sequence numbers, newline-delimited message framing
- Response routing to pending promises
- Idle timer: reset on each request, kill process after timeout
- Auto-respawn after shutdown or crash
- Request timeout (5s per request)
- Serialized request queue

Exposes: `definition(file, line, col)`, `references(file, line, col)`, `implementations(file, line, col)`, `openFile(file)`, `closeFile(file)`, `shutdown()`

### 2. LSP Indexer Stage (`src/indexer/lsp.ts`)
Runs after tree-sitter in the pipeline. The eager/batch path:
- Queries graph store for all `__unresolved__` edges
- For each, calls `definition()` using the call site location from the edge's evidence
- On success: creates resolved `lsp`-provenance edge, deletes unresolved edge
- On failure: leaves unresolved edge in place
- Also confirms existing tree-sitter edges via `definition()`, upgrading provenance to `lsp`
- Idempotent: skips already-resolved edges on re-run

### 3. LSP Resolver Helper (`src/indexer/lsp-resolver.ts`)
Called by `symbol_graph` at tool invocation time. The lazy/on-demand path:
- For a queried symbol, calls `references()` to find callers tree-sitter missed
- For interface symbols, calls `implementations()` to add `implements` edges
- Writes results as `lsp`-provenance edges to graph store
- Subsequent queries hit the cached edges, no re-query needed

### 4. Test Fixture Project (`test/fixtures/lsp-project/`)
Small TypeScript project (3-4 files) with:
- Cross-file function calls
- An interface with a concrete implementation
- Some genuinely unresolvable calls (dynamic dispatch)
- A `tsconfig.json`

### 5. Pipeline + Tool Integration
- `pipeline.ts` updated to run LSP stage after tree-sitter
- `symbol-graph.ts` updated to call LSP resolver before returning results

## Testing Strategy

### TsServerClient — unit tests with real tsserver
Against the fixture project, verify:
- `definition()` returns correct file + line for a known call site
- `references()` returns all reference locations for a known symbol
- `implementations()` returns concrete classes for an interface
- Idle timeout kills the process (short timeout like 100ms)
- Auto-respawn works after explicit shutdown
- Request timeout rejects the promise without crashing

### LSP Indexer Stage — integration tests with graph store
Tree-sitter-index the fixture project first, then run LSP stage. Assert:
- Unresolved edges replaced with `lsp`-provenance resolved edges pointing to correct targets
- Existing correct tree-sitter edges upgraded to `lsp` provenance
- Genuinely unresolvable edges remain as `__unresolved__`
- Running the stage again is idempotent (no duplicate edges)

### LSP Resolver (lazy path) — integration tests via `symbol_graph`
Call `symbol_graph` for a symbol in the fixture project with LSP resolution enabled. Assert:
- Result includes callers that tree-sitter alone would have missed
- Interface symbols show `implements` edges to concrete classes
- Results are cached — second call doesn't re-query tsserver

### Error scenarios
- tsserver not installed → LSP stage skipped, graph remains tree-sitter quality
- tsserver crashes mid-batch → auto-respawn, partial results preserved
- Request timeout → skip that edge, continue processing

## Error Handling

- **tsserver fails to start:** Look for `node_modules/.bin/tsserver` then global. If neither exists, skip LSP stage entirely. Log warning internally.
- **tsserver crashes mid-session:** Detect process exit, reject pending promises, mark client as "dead." Next request triggers auto-respawn. Partially-written edges are individually valid.
- **No results for definition query:** Unresolved edge stays — agent can still fill it via `resolve_edge`.
- **Request timeout (5s):** Skip that edge, move on. Idle timer is separate.
- **Stale LSP edges after file changes:** Content hash mismatch detection (existing in provenance model). Tree-sitter re-index of changed files deletes stale LSP edges. Next LSP pass re-resolves them.
- **Concurrent access:** Requests serialized via internal queue — tsserver handles one at a time anyway.
