# Code Review — 023-m2-lsp-integration

## Files Reviewed

| File | Type | Summary |
|------|------|---------|
| `src/indexer/tsserver-client.ts` | new | TsServerClient: spawn/lifecycle/protocol |
| `src/indexer/lsp.ts` | new | Eager LSP index stage (unresolved → resolved) |
| `src/indexer/lsp-resolver.ts` | new | Lazy on-demand resolver called from symbol_graph |
| `src/graph/sqlite.ts` | modified | 3 new methods: getUnresolvedEdges, getEdgesBySource, deleteEdge |
| `src/graph/store.ts` | modified | 3 new method signatures on GraphStore interface |
| `src/indexer/pipeline.ts` | modified | Made async, added LSP stage, IndexProjectOptions |
| `src/indexer/tree-sitter.ts` | modified | callEvidence() stores name:line:col in evidence |
| `src/index.ts` | modified | Lazy LSP resolution in symbol_graph tool handler |
| `test/tsserver-client.test.ts` | new | TsServerClient lifecycle & protocol tests (AC2–AC8) |
| `test/indexer-lsp.test.ts` | new | LSP index stage unit tests (AC17–AC21) |
| `test/tool-symbol-graph-lsp.test.ts` | new | LSP resolver integration tests (AC22–AC25) |
| `test/graph-store.test.ts` | modified | Tests for 3 new GraphStore methods |
| `test/indexer-extract-file.test.ts` | modified | Tests for callEvidence name:line:col format |
| `test/indexer-index-project.test.ts` | modified | Tests for async indexProject + LSP stage |
| `test/graph-types.typecheck.ts` | modified | Updated GraphStore mock with 3 new methods (tsc fix) |

---

## Strengths

**`tsserver-client.ts` — excellent process management:**
- Queue serialization via promise chaining (lines 200–202) elegantly enforces one-in-flight without a lock primitive.
- The `startupGrace` mechanic (line 184) generously extends the first-request timeout to absorb tsserver's cold-start — a subtle but real production concern.
- `onStdout` handles both newline-delimited and Content-Length-framed tsserver output in a single loop (lines 116–140), making it protocol-compliant against real tsserver releases.
- Idle-timeout via `resetIdleTimer` (lines 165–170) keeps tsserver alive during a session without leaking it permanently.
- `shutdown()` sends the graceful `exit` command and falls back to `kill()` after 1.5 s (lines 254–263) — correct two-phase teardown.

**`src/indexer/lsp.ts` — clean idempotency:**
- The AC21 (no duplicates on double run) is naturally enforced: on the second run, all unresolved edges are already gone and tree-sitter edges have been replaced by lsp edges, so there is nothing to process.
- `SUBSTR(target, 1, 16)` (sqlite.ts line 277) correctly avoids SQL `LIKE` treating `_` as a wildcard — good defensive SQL.

**Marker system in `lsp-resolver.ts`:**
- The edge-checked marker pattern (`hasMarker` checks both node existence AND the outbound edge, lines 11–17) elegantly handles stale-after-reindex without a separate "invalidate" operation — the `deleteFile` cascade takes care of it.

**Test quality:**
- `tsserver-client.test.ts` uses an inline Node.js fake server with a `maxInFlight` counter to prove the serialization invariant (AC7) without timing assumptions.
- The partial-results test (AC27) correctly uses a stateful counter on the mock client to fail on the second call, verifying per-edge persistence.
- `tool-symbol-graph-lsp.test.ts` covers the marker-reset-after-reindex path (AC25) — a subtle invariant that many implementations would miss.

---

## Findings

### Critical
None.

### Important

**1. `resolveMissingCallers` catch block created misleading `lsp`-provenance edges — FIXED**
- **File:** `src/indexer/lsp-resolver.ts` lines 83–109 (original)
- **What was wrong:** When `references()` threw any error (transient crash, timeout), the catch block iterated over all unresolved tree-sitter edges whose name matched the symbol, and wrote new edges with `source: "lsp"`, `confidence: 0.9`. This is name-matching (same logic as tree-sitter stage, confidence 0.5) misrepresented as high-confidence LSP resolution. Additionally, the marker was always set, preventing future retries for transient failures.
- **Why it matters:** (a) Agents reading the graph would see `lsp` provenance at 0.9 confidence and trust those edges, when they were actually name-guesses. (b) After a transient tsserver crash, the next `symbol_graph` call would be permanently blocked by the marker even though tsserver had recovered.
- **Fix applied:** Removed the fallback edge creation entirely. For permanent startup errors (`TsServer failed to start:`), the marker is set so we don't retry. For transient errors, the marker is left unset so the next call retries. Three regression tests added to lock in the corrected behavior.

**2. `tool-symbol-graph-lsp.test.ts` wiring test relied on the now-removed fallback — FIXED**
- **File:** `test/tool-symbol-graph-lsp.test.ts` line 152 (original)
- **What was wrong:** The "tool wiring" test was asserting `inbound.length > 0` after calling `symbol_graph`. This passed because the catch-block fallback in `resolveMissingCallers` created a fake lsp edge when real tsserver was unavailable. The test was not actually exercising real LSP resolution.
- **Fix applied:** The test now installs an inline fake tsserver in the fixture's `node_modules/.bin/`, making it hermetic. The fake returns a deterministic reference location for `shared`. The test now verifies real wiring, not a fallback artefact.

**3. `renderImplementationsSuffix` filtered to `lsp`-only implements edges — FIXED**
- **File:** `src/index.ts` lines 56–58 (original)
- **What was wrong:** The `.filter((n) => n.edge.provenance.source === "lsp")` excluded `agent`-provenance `implements` edges. Since `symbolGraph()` does not render `implements` edges at all, agent-written implements edges from `resolve_edge` would be completely invisible in tool output.
- **Why it matters:** The `resolve_edge` tool is a first-class mechanism for agents to teach the graph what static analysis can't see. Silently hiding those edges defeats the purpose.
- **Fix applied:** Filter removed — all implements edges regardless of provenance are now rendered. Regression test added.

**4. `graph-types.typecheck.ts` mock was missing the three new `GraphStore` methods — FIXED**
- **File:** `test/graph-types.typecheck.ts` line 59 (original)
- **What was wrong:** `tsc --noEmit` failed with a type error because the `validStore` test fixture did not include `getUnresolvedEdges`, `getEdgesBySource`, or `deleteEdge`. This was introduced by the M2 implementation and not caught before review.
- **Fix applied:** Added the three missing method stubs to the mock.

### Minor

**5. `notify("open")` is silently dropped on the first request**
- **File:** `src/indexer/tsserver-client.ts` lines 207, 220, 231
- The `notify("open", { file })` call is made synchronously before `request()` enqueues its async `run`. On the first call `this.proc` is null, so `notify` is a no-op (line 173 guard). tsserver therefore processes the first `definition`/`references`/`implementation` request without a prior `open` notification.
- **Why it's acceptable:** tsserver loads all project files from `tsconfig.json` on startup. For on-disk files that are part of a known project, `open` is a performance hint, not a hard requirement. All functional tests pass. The issue would only surface if querying files not in any tsconfig project, which is outside the current usage pattern.
- **How to fix (deferred):** Move the `this.notify("open", ...)` call inside the `run` async function after `await this.ensureStarted()`, so it is guaranteed to execute after the process has started.

**6. `TsServerClient` created fresh per `symbol_graph` call**
- **File:** `src/index.ts` lines 84–92
- A new client is instantiated, spawns tsserver, makes its requests, then shuts it down on every `symbol_graph` invocation. The idle-timeout mechanism (designed to amortize tsserver startup across consecutive queries) is never exercised.
- **Why it's acceptable for M2:** The lazy resolution only runs once per symbol (marker system). Subsequent `symbol_graph` calls skip the LSP phase. So the startup cost is paid once per unique symbol.
- **How to fix (deferred):** Keep a long-lived `TsServerClient` on the store or as a module singleton, aligned with the store lifecycle.

**7. `_projectRoot` parameter in `runLspIndexStage` is unused**
- **File:** `src/indexer/lsp.ts` line 40
- The parameter is acknowledged with a `_` prefix but not referenced in the function body. The client already carries its own `projectRoot`. Minor cleanliness concern; no functional impact.

**8. AC4 (post-crash respawn) and AC19 (null definition return) lack dedicated tests**
- **File:** `test/tsserver-client.test.ts` (AC4 gap), `test/indexer-lsp.test.ts` (AC19 gap)
- AC4: the implementation is correct by inspection (exit handler nulls `proc`; `ensureStarted` respawns), but no test covers the path "crash → make new request → request succeeds on respawned process."
- AC19: `if (!loc) continue;` correctly preserves unresolved edges, but no test covers the null-return path.
- Both are low-risk gaps; coverage is otherwise excellent at 23/27 criteria.

---

## Recommendations

1. **Long-lived `TsServerClient`** — Wire the client to the store's lifecycle rather than creating one per tool call. The idle timeout and connection reuse will matter at M3/M4 when more tool paths trigger LSP resolution.

2. **`notify("open")` inside `run`** — Move the `open` notification inside the `request()` queue so it always fires after `ensureStarted()`. This is a one-line change that makes the protocol correct regardless of process state.

3. **AC4 test** — Add a test that SIGKILLs tsserver after a request, then immediately makes another request and asserts it succeeds (proving respawn). The test framework already does this in AC5 — AC4 just needs the "success after crash" assertion.

4. **Remove `_projectRoot` from `runLspIndexStage` signature** — It's dead weight. If a future stage needs it, it can be re-added.

---

## Assessment

**ready**

Two behavioral bugs (false `lsp` provenance in catch block; invisible agent implements edges) and one tsc failure (missing GraphStore mock methods) were found and fixed. Four tests were added as regressions. The remaining findings are minor or deferred-by-design. All 86 tests pass and `tsc --noEmit` is clean.
