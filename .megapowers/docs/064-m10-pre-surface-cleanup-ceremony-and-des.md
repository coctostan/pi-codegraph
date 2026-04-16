# M10 Pre-Surface Cleanup: Conditional Trust Ceremony and Normalized Tool Descriptions

**Issue:** 064 (batch: #059 + #060)  
**Type:** feature  
**Milestone:** M10

---

## What Was Built

This issue delivered two coordinated cleanups that reduce per-call noise and description drift without changing any tool name, parameter schema, or persisted graph behavior.

### 1. Conditional Trust Header and Dev-Gated Token Meta (Phase 1)

**Problem:** Every read-only tool call prepended a `## Trust` header and appended a `_meta: tokens_saved:…` footer unconditionally. On the ~95% of calls where the graph is fresh, both are noise — the Trust header carries no actionable information, and `tokens_saved` is developer telemetry the model never uses.

**Solution:**
- `src/output/read-only-ceremony.ts` — new helper `suppressFreshTrustHeader()` strips the Trust header only when `status: fresh`. Non-fresh statuses (`stale`, `mixed`, `heuristic`, `runtime-backed`) still render the full header.
- `src/tools/token-tracker.ts` — new `devMetaEnabled()` and `appendTokenMetaIfEnabled()` functions gate the `_meta` footer behind `CODEGRAPH_DEVMETA=1`. The env var is read on each call, so toggling it in a running session takes effect immediately.
- `src/index.ts` — `finalizeReadOnlyOutput()` centralizes all read-only post-processing (fresh-header suppression → readonly-note injection → optional `_meta`) into one helper shared by all nine read-only tools.

**Invariants preserved:**
- Per-edge provenance labels (`confidence:0.9  tree-sitter`) remain on every call.
- Per-symbol signal badges (`[hub]`, `[tested]`, `[bottleneck]`) remain on every call.
- `indexing-failed: graph may be stale (readonly database)` renders whenever `lastIndexError` is set, regardless of Trust status or `_meta` gate.

**Bug fixed during review:** `dbIsWritable()` previously only checked `graph.db` write permission, missing the case where the `.codegraph/` directory itself is non-writable (which blocks SQLite journal writes). Both the file and the directory are now checked.

### 2. Normalized Tool Descriptions (Phase 2)

**Problem:** Tool descriptions were inconsistent — some terse, some multi-line with inline Cypher examples, some cross-referencing other tools. The README listed 8 tools while the code registered 11.

**Solution:**
- All 11 descriptions in `src/index.ts` rewritten to follow a single style: one terse action-oriented first line, optional `When to use:` block (1–2 lines), no inline examples, no cross-references, no parameter restatement.
- `docs/tool-descriptions.md` — new style guide codifying the rules for future contributors.
- `README.md` — updated to list all 11 registered tools with correct descriptions and example calls.
- `ARCHITECTURE.md` — tool inventory aligned to all 11 registered tools; pointer to `docs/tool-descriptions.md` added under `## Output Layer`.

---

## Files Changed

| File | Change |
|------|--------|
| `src/output/read-only-ceremony.ts` | New — `suppressFreshTrustHeader()` |
| `src/tools/token-tracker.ts` | Added `devMetaEnabled()`, `appendTokenMetaIfEnabled()` |
| `src/index.ts` | `finalizeReadOnlyOutput()`, `dbIsWritable()` improved, all 11 descriptions updated |
| `docs/tool-descriptions.md` | New — tool description style guide |
| `README.md` | 8→11 tool inventory, updated descriptions and examples |
| `ARCHITECTURE.md` | Tool inventory aligned, style-guide pointer added |
| `test/output-readonly-ceremony.test.ts` | New — unit tests for `suppressFreshTrustHeader()` |
| `test/extension-readonly-trust-gating.test.ts` | New — extension-level fresh/non-fresh/readonly coverage (4 tests) |
| `test/extension-readonly-devmeta.test.ts` | New — per-call `CODEGRAPH_DEVMETA` toggling |
| `test/extension-tool-descriptions.test.ts` | New — all-11-tool description contract |
| `test/extension-trace-description.test.ts` | Updated to approved description |
| `test/extension-graph-query-description.test.ts` | Updated to approved description |
| `test/extension-symbol-search.test.ts` | Updated to approved description |

---

## Verification

- 423 tests pass, 0 fail, `tsc --noEmit` clean.
- Fresh `symbol_graph` output no longer includes `## Trust`.
- Heuristic `trace` output still starts with `## Trust\nstatus: heuristic`.
- `CODEGRAPH_DEVMETA=1` re-enables `_meta`; unsetting it on the next call suppresses it.
- `indexing-failed` note renders regardless of trust status or `_meta` flag.
