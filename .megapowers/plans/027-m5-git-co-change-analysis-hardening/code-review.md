# Code Review: 027-m5-git-co-change-analysis-hardening

## Files Reviewed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/indexer/git.ts` | New | Git co-change Stage 5 — parses `git log`, computes weighted pair scores, emits `co_changes_with` edges |
| `src/indexer/pipeline.ts` | Modified | Adds Stage 5 wiring, per-stage timing instrumentation, `timings` field in `IndexResult`, `__` prefix guard in cleanup loop |
| `src/indexer/tree-sitter.ts` | Modified | Aliased imports, namespace imports, re-exports, dynamic imports; updated `pushEdge` deduplication key |
| `src/graph/store.ts` | Modified | Adds `GraphStatistics` interface, `getStatistics()` to `GraphStore` |
| `src/graph/sqlite.ts` | Modified | Implements `getStatistics()`, two new SQLite indexes, import of `createHash`/`readFileSync`/`join` |
| `test/graph-types.typecheck.ts` | Modified | Adds `getStatistics` stub to typecheck fixture |
| `test/indexer-extract-file.test.ts` | Modified | Updates aliased import test to assert correct behavior (resolves to original name) |
| `test/indexer-index-project.test.ts` | Modified | `toEqual` → `toMatchObject` to accommodate new `timings` field in result |
| `test/indexer-git-cochange.test.ts` | New | Co-change edge creation, threshold filtering, recency weighting |
| `test/indexer-git-incremental.test.ts` | New | HEAD-based skip and rebuild |
| `test/indexer-git-no-repo.test.ts` | New | Non-git dir, empty repo, stderr suppression |
| `test/indexer-pipeline-git-stage.test.ts` | New | End-to-end: git stage runs, edges created, timings present |
| `test/indexer-index-result-shape.test.ts` | New | `IndexResult` backward compatibility |
| `test/indexer-dynamic-imports.test.ts` | New | Dynamic import edge confidence 0.3, non-literal arg ignored |
| `test/indexer-namespace-imports.test.ts` | New | Namespace import edge, qualified call resolution, non-namespace guard |
| `test/indexer-reexports.test.ts` | New | Re-export with original name, aliased re-export, barrel file |
| `test/graph-store-statistics.test.ts` | New | Node/edge/file count statistics |
| `test/graph-store-staleness.test.ts` | New | Stale file detection |
| `test/graph-store-indexes.test.ts` | New | Index existence assertions |
| `test/graph-store-statistics-sentinel.test.ts` | New | Regression test for sentinel key exclusion from statistics (added in this review) |

---

## Strengths

**`src/indexer/git.ts` — clean, focused module**
- The parser (`parseGitLog`) is clearly separated from the analysis (`runGitCoChangeStage`). `--diff-filter=AMRT` correctly omits deletions-only commits; `maxBuffer: 50MB` is a sensible ceiling.
- `stdio: ["ignore", "pipe", "ignore"]` on all `execSync` calls throughout the module cleanly suppresses git noise (confirmed by the stderr test in `indexer-git-no-repo.test.ts`).
- Incremental design (HEAD-keyed skip + clear-rebuild) is simple and correct. Storing the HEAD in `file_hashes` reuses existing infrastructure without adding schema.
- `Math.min(0.9, 0.3 + data.count * 0.1)` confidence curve is reasonable — saturates at 9 co-changes.

**`src/indexer/pipeline.ts` — timing instrumentation**
- Every stage is wrapped cleanly in `performance.now()` start/end pairs. Timings are `Math.round`-ed to integers. The `__` prefix guard (`oldFile.startsWith("__")`) at line 97 was a thoughtful defensive fix to prevent the sentinel from triggering spurious "file removed" logic.

**`src/indexer/tree-sitter.ts` — edge case hardening**
- `aliasToOriginal` map + lookup at call site (`aliasToOriginal.get(callee.text) ?? callee.text`) is compact and correct for aliased imports.
- Namespace import handling correctly gates on `namespaceImports.has(obj.text)` before emitting, preventing false positives on arbitrary member calls (verified by the "non-namespace" test).
- Re-export handling correctly skips statements without a `source` node, so `export const x = 1` is not misidentified.
- Dynamic import confidence of 0.3 matches the design intent and is clearly differentiated from static imports.

**Testing**
- High test isolation: all git-dependent tests create fresh temp repos with predictable commit history and clean up in `finally` blocks.
- The `indexer-git-no-repo.test.ts` stderr-suppression test via `spawnSync` is a clever way to verify no output leaks to the agent's stderr.
- Tests are behavior-focused, not mock-focused — they use real SQLite stores and real git repos.

---

## Findings

### Critical

None.

---

### Important

**`getStatistics()` inflates `files.total` and `files.stale` via the `__git_cochange_head__` sentinel** (`src/graph/sqlite.ts:222`)

The git stage stores its HEAD-tracking key in `file_hashes` with the value `"__git_cochange_head__"`. `getStatistics()` previously queried all rows without filtering sentinel entries, causing:
- `files.total` to be off by 1 after any git stage run
- `files.stale` to always include a false positive when `projectRoot` is provided, since `readFileSync(join(projectRoot, "__git_cochange_head__"), ...)` fails (no such file) and increments `stale`

**Verified with a manual script**: `files.total: 3, files.stale: 3` for a 2-file repo.

**Status: Fixed in this review session.** The `fileRows` query now filters `r.file.startsWith("__")` before computing totals and iterating for staleness. New regression test added: `test/graph-store-statistics-sentinel.test.ts`. Full suite: 194 pass, 0 fail.

---

### Minor

**1. Evidence format inconsistency: static imports use quoted specifiers, dynamic imports use unquoted** (`src/indexer/tree-sitter.ts:178, 156`)

Static import: `const evidence = sourceNode.text` → `'"./utils"'` (raw token text, includes quotes).  
Dynamic import: `evidence: specifier` where `specifier = firstArg.text.replace(/^['"\`]|['"\`]$/g, "")` → `"./utils"` (stripped).

Tests use `toContain("./utils")` which passes either way, but the inconsistency could confuse future callers who pattern-match evidence strings. Suggest always stripping to normalise, or document the convention.

**2. `pushEdge` deduplication key now includes `evidence`** (`src/indexer/tree-sitter.ts:82`)

The key was extended from `source|target|kind|provenance.source` to `source|target|kind|provenance.source|evidence`. This means two edges with identical `(source, target, kind, provenance.source)` but different evidence strings both appear in the in-memory `edges` array. When persisted via `INSERT OR REPLACE` (which uses the SQLite PK `(source, target, kind, provenance_source)`), the second silently overwrites the first. The in-memory result and the persisted graph can thus diverge in this edge case.

In practice this is low risk — most duplicate edges have the same evidence — but worth noting for anyone consuming `extractFile` directly in tests.

**3. `runGitCoChangeStage` blocks the event loop despite `async` signature** (`src/indexer/git.ts:75`)

Both `getCurrentHead` and `parseGitLog` use `execSync`. For large repos with years of history, `git log --name-only` can be slow (seconds). Since the pipeline awaits each stage sequentially, this blocks Node's event loop for the entire git log parse. Acceptable for v1 given the 50MB buffer limit, but worth migrating to `execFileSync`→`spawnSync` or a streaming approach before operating on monorepos.

**4. `computeDecayWeight` doesn't guard against NaN dates** (`src/indexer/git.ts:57-61`)

`new Date(commitDateIso).getTime()` returns `NaN` for malformed dates. This propagates as `NaN` through `weightedScore` into evidence string: `"co_changes: 2, recency_score: NaN, window: 365d"`. Git's `%aI` format is reliable, but defensive handling (`if (isNaN(commitTime)) return 1;` fallback) would be belt-and-suspenders.

**5. `listFiles()` exposes the `__git_cochange_head__` sentinel** (`src/graph/sqlite.ts:196-199`)

`listFiles()` returns all `file_hashes` entries, including the git sentinel. Callers in `lsp.ts:46` and `lsp-resolver.ts:132` call `getNodesByFile(file)` which returns `[]` for the sentinel, so they are functionally safe. The `src/index.ts:78` `listFiles().length === 0` check would incorrectly see `length=1` if only the sentinel is present (no actual files indexed) — an edge case triggered only by running the git stage in isolation, which isn't a supported workflow. Low priority, but filtering `__` prefixes in `listFiles()` would be cleaner long-term.

---

## Recommendations

1. **Normalize evidence strings** — strip quotes from import specifiers consistently across static, namespace, and dynamic import edges. This makes evidence reliably parseable by tools that analyse edge evidence content.

2. **Async git execution** — consider replacing `execSync` in `git.ts` with `spawnSync`/`child_process.execFile` with a timeout option so a hung `git log` doesn't freeze the pipeline indefinitely.

3. **`__` prefix convention** — the sentinel-key pattern (storing non-file metadata in `file_hashes`) is ad hoc. If more stages need metadata storage, a dedicated `metadata` table would be cleaner. For now, documenting the `__`-prefix convention in a comment near `GIT_HEAD_KEY` would help future contributors.

4. **Single-directional co-change edges** — the implementation correctly emits only one direction per pair. Tools querying co-change neighborhoods must use `direction: "both"`. This is consistent with `getNeighbors` supporting `"both"`, but worth a comment in `git.ts` explaining the design choice.

---

## Assessment

**ready**

The implementation satisfies all 19 acceptance criteria, passes the full test suite (194/194), and is well-structured. One Important bug was found and fixed during this review: `getStatistics()` was double-counting the `__git_cochange_head__` sentinel in `files.total` and incorrectly reporting it as a stale file. The fix is minimal and surgical — a single `.filter()` clause — with a new regression test. The remaining findings are minor style/defensive-coding observations with no correctness impact.
