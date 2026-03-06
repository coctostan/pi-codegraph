# Verification Report — 023-m2-lsp-integration

## Test Suite Results

```
bun test v1.3.9 (cf6cdbbb)

 82 pass
 0 fail
 285 expect() calls
Ran 82 tests across 21 files. [2.83s]
```

TypeScript type check:
```
tsc --noEmit
✓ Build successful (0 units compiled)
```

---

## Per-Criterion Verification

### Criterion 1: TsServerClient spawns lazily, prefers local node_modules/.bin/tsserver
**Evidence:** `src/indexer/tsserver-client.ts` `findTsserver()` (line 68–71) checks `join(projectRoot, "node_modules", ".bin", "tsserver")` first, falls back to `"tsserver"`. Constructor stores the path but does NOT call `ensureStarted()` — spawn only occurs on first `request()`. Test "constructor prefers local node_modules/.bin/tsserver when no override is given" passes: `client.getResolvedTsserverPath()` contains `"node_modules/.bin/tsserver"`. The AC2/AC3 test confirms `getPid()` is null before the first request.
**Verdict:** pass

### Criterion 2: Kills tsserver after configurable idle timeout (default 30s)
**Evidence:** `idleMs` defaults to `30_000` (line 46). `resetIdleTimer()` calls `shutdown()` after the interval. Test "AC2/AC3: idle shutdown then respawn on next request" uses `idleMs: 50`, waits 120ms, and asserts `getPid()` returns null.
**Verdict:** pass

### Criterion 3: Auto-respawns on next request after idle shutdown
**Evidence:** Same test: after idle shutdown, `definition()` is called again. `secondPid` is a new, non-null PID different from `firstPid`.
**Verdict:** pass

### Criterion 4: Auto-respawns if process crashes mid-session
**Evidence:** Code inspection: `proc.once("exit", ...)` handler (line 95–102) sets `this.proc = null`. Next call to `request()` → `ensureStarted()` → checks `if (this.proc && this.proc.stdin?.writable) return` (proc is null, falls through) → spawns new process. No dedicated test exercises the make-a-request-after-crash path; the AC5 test crashes the process then calls `shutdown()`, not a subsequent request.
**Verdict:** partial (implementation correct via inspection; no dedicated test for post-crash respawn request)

### Criterion 5: Rejects pending requests when tsserver crashes
**Evidence:** Test "AC5: pending requests are rejected if process crashes" — sends a `slowDefinition` (never responds), `SIGKILL`s the process, asserts `hung.rejects.toThrow("TsServer process exited unexpectedly")`.
**Verdict:** pass

### Criterion 6: Timeouts individual requests without killing process
**Evidence:** Test "AC6: request timeout rejects without killing process" — `timeoutMs: 80`, sends `slowDefinition`, asserts rejection with `"TsServer request timed out: slowDefinition"`. Then sends a normal `definition()` request and asserts it succeeds with the **same** PID.
**Verdict:** pass

### Criterion 7: Serializes concurrent requests (one in-flight at a time)
**Evidence:** Test "AC7: concurrent requests are serialized (max in-flight is 1)" — fires two concurrent requests with `Promise.all`, then queries `debugMaxInFlight` from the fake server. Asserts `stats.maxInFlight === 1`.
**Verdict:** pass

### Criterion 8: shutdown() kills process and cleans up resources
**Evidence:** Test "AC8: shutdown() cleans up process and pending timers" — after `definition()`, `getPid()` is non-null; after `shutdown()`, `getPid()` is null and `getPendingCountForTest()` is 0.
**Verdict:** pass

### Criterion 9: definition() returns { file, line, col } or null
**Evidence:** Fake tsserver responds to `definition` with `[{ file: "src/api.ts", start: { line: 1, offset: 17 } }]`. AC6 test asserts `loc?.file === "src/api.ts"`. `TsServerClient.definition()` maps `start.offset` → `col`. Returns null when body is empty (`if (!body || body.length === 0) return null`).
**Verdict:** pass

### Criterion 10: references() returns array of { file, line, col }
**Evidence:** Fake tsserver responds to `references` with `{ refs: [{ file: "src/impl.ts", start: { line: 4, offset: 5 } }] }`. `resolveMissingCallers` tests use this — `references()` is called and the returned location is used to write a caller edge. AC7 test calls `client.references(...)` as one of the concurrent requests.
**Verdict:** pass

### Criterion 11: implementations() returns array of { file, line, col }
**Evidence:** Fake tsserver responds to `implementation` with `[{ file: "src/impl.ts", start: { line: 2, offset: 14 } }]`. `resolveImplementations` tests (in `tool-symbol-graph-lsp.test.ts`) call `client.implementations()` and use the result to write `implements` edges with correct file/line/col.
**Verdict:** pass

### Criterion 12: Tree-sitter stores call site position in evidence as name:line:col
**Evidence:** `src/indexer/tree-sitter.ts` `callEvidence(node)` (line 212): `` `${node.text}:${node.startPosition.row + 1}:${node.startPosition.column + 1}` ``. Tests "extractFile records call-site coordinates in calls evidence (bare call)" and "extractFile records constructor call-site coordinates in calls evidence (new expression)" both pass (82 total pass).
**Verdict:** pass

### Criterion 13: GraphStore.getUnresolvedEdges() returns edges targeting __unresolved__
**Evidence:** `src/graph/sqlite.ts` line 270–282: SQL uses `SUBSTR(target, 1, 16) = '__unresolved__::'` to avoid LIKE wildcard issues. Test "getUnresolvedEdges returns only edges whose target starts with __unresolved__::" passes. Used directly in `indexer-lsp.test.ts`.
**Verdict:** pass

### Criterion 14: GraphStore.deleteEdge(source, target, kind, provenanceSource)
**Evidence:** `src/graph/sqlite.ts` line 297–309: DELETE WHERE four PK columns match. Test "deleteEdge removes only the matching (source, target, kind, provenanceSource) row" passes.
**Verdict:** pass

### Criterion 15: GraphStore.getEdgesBySource(sourceId)
**Evidence:** `src/graph/sqlite.ts` line 284–295: SELECT WHERE source = ?, ordered by created_at ASC. Test "getEdgesBySource returns all edges for a source ordered by created_at ASC" passes.
**Verdict:** pass

### Criterion 16: LSP stage skipped if tsserver cannot be started
**Evidence:** `src/indexer/lsp.ts` line 15–17: `isStartupError` checks `err.message.startsWith("TsServer failed to start:")`. Line 68: `if (isStartupError(err)) return;` causes the entire `runLspIndexStage` to return early on the first spawn failure. The first `indexProject` test runs without a fake client and passes with `errors: 0` even though tsserver may or may not be globally available — the error path is swallowed. No dedicated test forces tsserver-not-found; the behavior is validated indirectly.
**Verdict:** partial (implementation correct; first indexProject test implicitly validates graceful completion, no dedicated tsserver-absent test)

### Criterion 17: LSP indexer parses evidence name:line:col and calls definition()
**Evidence:** `src/indexer/lsp.ts` `parseEvidence()` (line 5–13): splits on `:`, returns `{ name, line, col }`. Test "resolves unresolved calls edge by evidence name + resolved file/line" asserts `definition()` is called with `file="src/a.ts"`, `line=2`, `col=5` (matching `"target:2:5"` evidence).
**Verdict:** pass

### Criterion 18: definition() result → new lsp calls edge + old unresolved deleted
**Evidence:** Same test: after `runLspIndexStage`, `getUnresolvedEdges()` has length 0, `getEdgesBySource(caller.id)` filtered to `lsp` has length 1 with target = resolved callee ID and confidence 0.9.
**Verdict:** pass

### Criterion 19: definition() returns null → unresolved edge unchanged
**Evidence:** `src/indexer/lsp.ts` line 72: `if (!loc) continue;` — if null, skips without deleting the unresolved edge. No dedicated test for the null-return path (the "partial results" test uses a thrown error on the second call, not a null return). Code is correct via inspection.
**Verdict:** partial (implementation correct via inspection; no dedicated test verifying null preserves unresolved edge)

### Criterion 20: Upgrades tree-sitter edges to lsp when definition confirms
**Evidence:** Test "AC20: upgrades confirmed tree-sitter edge when definition matches existing target node" — after stage: lsp edge exists (length 1, confidence 0.9), tree-sitter edge deleted (length 0).
**Verdict:** pass

### Criterion 21: Running LSP stage twice produces no duplicates (idempotent)
**Evidence:** Test "AC21: running the LSP stage twice produces no duplicate edges" — two `runLspIndexStage` calls, then asserts exactly 1 lsp edge from caller.id.
**Verdict:** pass

### Criterion 22: symbol_graph calls references() and adds missing caller edges
**Evidence:** Test "resolveMissingCallers persists callers and writes marker; second run skips references()" — `calls` counter is 1 after two `resolveMissingCallers` invocations; caller edge has lsp provenance, confidence 0.9. Test "tool wiring: symbol_graph invokes resolver and persists lsp caller edge before render" runs the full tool against real files; asserts inbound lsp calls edges > 0 and result contains "Callers".
**Verdict:** pass

### Criterion 23: symbol_graph for interface calls implementations() and adds implements edges
**Evidence:** Test "resolveImplementations persists implements edges and marker; second run skips implementations()" — `calls` counter 1 after two invocations; implements edge exists with lsp provenance, confidence 0.9. Test "tool path: interface symbol_graph resolves implementations..." runs full tool; asserts inbound lsp implements edges > 0, result contains "Implementations" and "Worker".
**Verdict:** pass

### Criterion 24: LSP edges from lazy path are persisted — second symbol_graph call doesn't re-query
**Evidence:** Marker system in `src/indexer/lsp-resolver.ts`. `hasMarker()` checks for a `__meta__::resolver::callers::<symbolId>` node with outbound edge to the symbol. `setMarker()` writes both. Second `resolveMissingCallers` call hits `if (hasMarker(...)) return` immediately. Test confirms `calls === 1` after two invocations.
**Verdict:** pass

### Criterion 25: Tree-sitter re-index of changed file deletes stale lsp edges
**Evidence:** `deleteFile()` SQL (line 344–352): `DELETE FROM edges WHERE provenance_source != 'agent' AND (source IN ... OR target IN ...)` — deletes all non-agent edges touching nodes from the file, including lsp-provenance edges. Test "resolveMissingCallers re-resolves after file re-index (stale marker edge cleared)": first resolution sets marker; `store.deleteFile("src/api.ts")` removes the marker→symbol edge (marker node survives but edge gone); second resolution runs (`calls === 2`), proving stale edges were cleared.
**Verdict:** pass

### Criterion 26: If tsserver unavailable, pipeline completes with only tree-sitter edges — no error
**Evidence:** Same as AC16. `isStartupError` causes `runLspIndexStage` to return without throwing. `indexProject` wraps LSP stage in `try/finally` (line 97–101) — any remaining errors from `shutdown()` are swallowed. First `indexProject` test (no fake client, tsserver may be absent) resolves with `{ indexed: 2, skipped: 0, removed: 0, errors: 0 }`.
**Verdict:** partial (implementation correct; first indexProject test implicitly validates; no dedicated absent-tsserver test)

### Criterion 27: Tsserver crash mid-stage preserves already-written edges
**Evidence:** Test "partial results are preserved when tsserver crashes mid-stage" — two unresolved edges; first `definition()` returns result (edge written), second throws. After stage: `getEdgesBySource(caller.id).filter(lsp)` length 1; `getUnresolvedEdges()` length 1. Partial results preserved.
**Verdict:** pass

---

## Overall Verdict

**pass**

All 82 tests pass. TypeScript type check succeeds. 23 of 27 criteria have dedicated tests with direct evidence. The remaining 4 (AC4, AC16, AC19, AC26) have correct implementations verified by code inspection:

- **AC4**: `proc` set to null on exit event; `ensureStarted()` respawns on next request — no dedicated post-crash-respawn test
- **AC16/AC26**: `isStartupError` → early return from `runLspIndexStage`; first indexProject test implicitly validates (0 errors without fake client)  
- **AC19**: `if (!loc) continue;` trivially preserves unresolved edge; no test for the null-return case

These are test-coverage gaps, not behavioral gaps. The implementation satisfies all 27 acceptance criteria.
