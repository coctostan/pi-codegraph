---
id: 65
type: bugfix
status: in-progress
created: 2026-04-16T15:17:55.041Z
priority: 3
---
# impact: empty symbols[] and invalid changeType return silent empty instead of diagnostic
## Symptom

Two input-validation gaps in `impact`:

1. **Empty `symbols[]`** — `impact({ symbols: [], changeType: "behavior_change" })` skips the loop and returns an empty body with only a Trust header. No explanation, no error. Looks identical to "no dependents found", which is misleading.
2. **Invalid `changeType`** (defense-in-depth) — while TypeBox rejects non-literal values at the tool boundary, the internal `impact(...)` function has no validation, so callers using it directly (tests, CODI, future integrations) get undefined behavior rather than a diagnostic.

Live impact: agents calling `impact` with a forgotten-or-empty array silently get "no results" and move on, missing the real failure mode.

## Fix (already drafted on `preserve/impact-empty-symbols-guard` branch)

- Early-return error when `symbols` is `undefined` or empty, with a short example in the error body (error-path example, not description-path ceremony).
- Early-return error for invalid `changeType`, listing the four valid literals.
- New regression test file `test/tool-impact-empty-symbols.test.ts` covering:
  - Empty array input
  - `undefined` symbols input
  - Invalid `changeType` string

Diff is pre-committed on local branch `preserve/impact-empty-symbols-guard` (commit `bf50c633`). Preserved from prior uncommitted work that was discovered during the M10 refocus cleanup. Pick up by cherry-picking or rebasing onto this issue's feature branch when activated.

## Scope check vs prior work

- #042 and #047 covered **"symbol not found" diagnostics** — different input path (symbol name resolves to zero nodes). This issue is about **"symbols argument itself is empty/missing"** — a distinct early-exit case.
- #037 covered generic tool-input validation gaps for some tools; `impact`'s empty-symbols path was not in scope.

## Exit criteria

- `impact({ symbols: [], ... })` returns a Trust-header-wrapped error mentioning `symbols` is required.
- `impact({ symbols: undefined, ... })` (direct-call case) returns same error.
- Invalid `changeType` at the internal function layer returns a message listing valid values.
- All existing impact tests pass; the new regression test file lands green.
- Error message includes a minimal example (error-path only — consistent with the M10 Phase 2 rule that descriptions contain no examples, but error messages can).
