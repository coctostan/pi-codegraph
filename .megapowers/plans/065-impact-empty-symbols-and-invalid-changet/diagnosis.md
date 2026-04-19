# Diagnosis

## Root Cause

`impact(params)` in `src/tools/impact.ts` (lines 131–180) has **no input validation** on either `params.symbols` or `params.changeType` before it starts executing. Three concrete gaps, one shared root cause (missing defensive checks at the internal function boundary):

1. **Missing empty-array guard.** `impact()` dispatches straight into `for (const symbol of params.symbols)` at line 140 and, further down, into `collectImpactDetails(...)` at line 158 without distinguishing "caller supplied no symbols to analyze" from "analysis ran but found zero dependents". Downstream, `collectImpactDetails` at line 75 (`for (const symbol of symbols)`) simply iterates an empty array, produces no seeds, and the queue loop exits with `hits.length === 0`. That path is then squeezed through `if (hits.length === 0) return prependTrustHeader("", { stats });` on line 166 — the same "no dependents" empty-body branch used for legitimate analyses.
2. **Missing `changeType` validation.** `impact()` only short-circuits when `changeType === "addition"` (line 151). Any other non-literal value (e.g. `"invalid_type"`) falls through into `collectImpactDetails`, where `classify(changeType, depth)` at lines 36–43 has an exhaustive-literal cascade and returns `null` for anything that isn't one of the four valid values. Every neighbor is dropped at `if (!classification) continue;` (line 104), so the function produces zero hits and again returns `prependTrustHeader("", { stats })`. No error is ever surfaced.
3. **Missing `symbols: undefined` guard.** `for (const symbol of params.symbols)` on line 140 performs an iterable get on `undefined`, raising `TypeError: undefined is not an object (evaluating 'params.symbols')` in Bun. TypeBox rejects this at the tool boundary (`ImpactParams` in `src/index.ts:50–66` makes `symbols` a required `Type.Array`), but direct callers (tests, CODI, future SDK consumers) bypass that schema and crash.

Evidence — confirmed in the reproduce phase by running the three minimal direct-call cases:
- Empty: `impact({ symbols: [], changeType: "behavior_change", ... })` → 56-char Trust-header-only output (header + blank body).
- Invalid: `impact({ symbols: ["shared"], changeType: "invalid_type" as any, ... })` → identical 56-char Trust-header-only output.
- Undefined: `impact({ symbols: undefined as any, ... })` → `TypeError` at `src/tools/impact.ts:140:24`.

All three outcomes match the code path described above on `fix/065-impact-empty-symbols-and-invalid-changet` (branch tip `59af359c`), where the draft guards on `preserve/impact-empty-symbols-guard @ bf50c633` are not yet applied.

## Trace

Symptom (empty/silent output) → `impact()` returns `prependTrustHeader("", { stats })` at `src/tools/impact.ts:166`.

Who returns that empty body?
- `hits.length === 0` at line 166 — so `collectImpactDetails` returned `[]`.

Why does `collectImpactDetails` return `[]`?
- **Case 1 (empty `symbols`):** seed loop at lines 75–81 iterates zero elements → `queue` and `changedNodeIds` both empty → while-loop at line 85 exits immediately → `detailsByNode` empty → returns `[]`.
- **Case 2 (invalid `changeType`):** seeds are pushed normally, BFS runs, but at line 103 `classify(changeType, depth)` falls through every branch in lines 36–43 (no match for `"invalid_type"`) and returns `null`; guarded by `if (!classification) continue;` at line 104, every neighbor is skipped before any entry lands in `detailsByNode`. Returns `[]`.

Who could have prevented this?
- `impact()` at `src/tools/impact.ts:131–180` — the externally-callable surface. It validates nothing about `symbols.length` or membership of `changeType`. The first meaningful statement is `params.store.getStatistics(params.projectRoot)` at line 138, then the bare `for...of` at line 140 (which is also where the undefined case throws).
- `ImpactParams` TypeBox schema at `src/index.ts:50–66` — does enforce non-undefined array + literal changeType, but only at the registered-tool boundary (`pi.registerTool({ parameters: ImpactParams })` at line 285). Note: the TypeBox array schema does **not** enforce `minItems: 1`, so even tool-boundary callers can submit `symbols: []` and get the silent path.

Root fault line: `impact()` is reachable by direct callers (verified in existing tests like `test/tool-impact-empty-output.test.ts`, `test/tool-impact-ambiguous.test.ts`, and `test/tool-impact-trust-header.test.ts`) and must not assume prior validation. The missing defensive checks between lines 137 and 140 (and between lines 149 and 151) are the single root cause that manifests as three symptoms.

## Affected Code

- `src/tools/impact.ts:131–180` — `impact(params: { symbols; changeType; store; projectRoot; maxDepth? }): string`. Needs empty/undefined `symbols` guard at entry; needs `changeType` membership check against `["signature_change", "removal", "behavior_change", "addition"]` before flowing into `collectImpactDetails`.
- `src/tools/impact.ts:66–81` — `collectImpactDetails(params)`; the pre-committed draft adds `if (!symbols || symbols.length === 0) return [];` at line 69 as belt-and-braces defense; the authoritative diagnostic will still need to live in `impact()` so the error message reaches the formatted tool output.
- `src/tools/impact.ts:7` — `export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";`. This is the canonical list that the new error message must stay in sync with.
- `src/index.ts:50–66` — `ImpactParams` TypeBox schema. Not strictly broken (TypeBox rejects non-literal `changeType` and non-array `symbols` at the tool boundary), but does not enforce `minItems: 1`, so empty arrays reach the internal function through the tool path too. The draft on `preserve/impact-empty-symbols-guard` does **not** amend this schema; validation is handled inside `impact()` and the tool continues to pipe `params.symbols`/`params.changeType` straight through.

Pre-committed draft patch that addresses this (to be picked up in implement): `preserve/impact-empty-symbols-guard @ bf50c633` — touches `src/tools/impact.ts` (+16) and adds `test/tool-impact-empty-symbols.test.ts` (+83 with three cases covering empty array, undefined symbols, invalid changeType; asserts `## Trust`, `Error`, `symbols`/`changeType`/`required`).

## Pattern Analysis

Working precedent for "return a diagnostic inside a Trust-wrapped body" already exists in this file for two related cases:

- `addition` change type (line 151–156): `impact()` returns `prependTrustHeader("addition: impact analysis for additions is not yet supported — use symbol_graph ...\n", { stats })`. This is the exact shape the new empty-symbols and invalid-changeType messages should mirror: short English sentence, terminated with `\n`, wrapped in `prependTrustHeader(..., { stats })`.
- `symbol not found` / `ambiguous` (lines 140–149 via `resolveUniqueSymbol`): returns `prependTrustHeader(resolved.text, { stats })` with text coming from `src/tools/symbol-resolution.ts:29` (`"${label} \"${name}\" not found"`) or the ambiguous formatter. Regression-tested in `test/tool-impact-empty-output.test.ts` (asserts `"## Trust"` + `"not found"` + the offending name).

Other tools follow the same pattern:
- `src/tools/resolve-edge.ts:44–45` — `if (!evidence || evidence.trim().length === 0) return "evidence is required — ...";`
- `src/tools/resolve-edge.ts:66–67` and `src/tools/delete-edge.ts:61–62` — `if (!isValidEdgeKind(kind)) return \`Invalid edge kind "${kind}". Valid kinds: ${VALID_EDGE_KINDS.join(", ")}\`;`

Differences between working (`addition` branch, `resolveUniqueSymbol` branch) and broken (empty-symbols, invalid-changeType) paths:

| Aspect | Working (`addition`, `not_found`) | Broken (`symbols: []`, `changeType: invalid_type`, `symbols: undefined`) |
|---|---|---|
| Entry check | Explicit literal branch (`if (params.changeType === "addition")`) or helper (`resolveUniqueSymbol`) | None — raw `for...of` on `params.symbols`, no membership check on `changeType` |
| Output shape | `prependTrustHeader(<diagnostic>, { stats })` | `prependTrustHeader("", { stats })` (empty body) or an uncaught throw |
| Observable effect | Agent sees a clear English message | Agent sees Trust header + empty body, indistinguishable from "analysis ran, nothing found" |
| Regression test | `test/tool-impact-empty-output.test.ts`, `test/tool-impact-ambiguous.test.ts` | None — the draft file `test/tool-impact-empty-symbols.test.ts` on the preserve branch supplies the missing coverage |

Violated assumption: `impact()` assumes its inputs have been pre-validated (either by TypeBox at the registered-tool boundary, or by the caller). That assumption is false for direct callers and for the TypeBox-empty-array edge case.

## Risk Assessment

Call surface:
- `impact()` is called from exactly one production site — `src/index.ts:290` inside the `registerReadOnlyTool` `execute` for the `impact` tool. It's also called directly from eight test files: `test/tool-impact.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-empty-output.test.ts`, `test/tool-impact-ambiguous.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-performance.test.ts`, `test/tool-impact-trust-header.test.ts`, `test/extension-impact.test.ts` (plus `token-tracker-all-tools.test.ts`). `collectImpactDetails`/`collectImpact` have no non-impact consumers in `src/`.
- Existing tests always provide non-empty `symbols` and valid `changeType`, so adding early-return error branches will not perturb them. Confirmed by grep: no existing test passes `symbols: []`, `symbols: undefined`, or a non-literal `changeType`.

Things that could break if the fix is miswritten:
- If the new guards return a non-Trust-wrapped string, `tool-impact-trust-header.test.ts` / its siblings will regress — keep using `prependTrustHeader(..., { stats })`.
- If the `addition` branch is reordered to run *after* the new guards, the existing "addition diagnostic" path still needs to route through its current message (tested in `test/tool-impact-empty-output.test.ts`). Safe order: validate `symbols` first, then validate `changeType` (which makes the subsequent `"addition"` short-circuit valid), then existing logic.
- `ImpactParams` is not being changed; the M10 public-surface description/schema work (issues #64, #67) is out of scope for this bugfix.

Related bugs sharing this root cause:
- None currently filed for `trace` or `dead_code`, but the same "no validation of required-array input at the internal-function boundary" pattern is worth sanity-checking during implement — those are separate issues and explicitly out of scope here (#65 is scoped to `impact` only per the issue body's "Scope check vs prior work" section).

## Fixed When

1. `impact({ symbols: [], changeType: "behavior_change", ... })` returns a string that contains `## Trust`, the word `Error`, and the word `symbols`, with a minimal example (error-path example, per issue #65 exit criteria and the M10 Phase 2 "descriptions have no examples, but error messages may" rule).
2. `impact({ symbols: undefined as any, changeType: "behavior_change", ... })` returns the same diagnostic shape as (1) — does **not** throw a `TypeError`.
3. `impact({ symbols: ["shared"], changeType: "invalid_type" as any, ... })` returns a string that contains `## Trust`, the word `Error`, and the word `changeType`, and lists the four valid literals `signature_change`, `removal`, `behavior_change`, `addition`.
4. `test/tool-impact-empty-symbols.test.ts` lands green with at least the three cases above. (The draft file on `preserve/impact-empty-symbols-guard` already meets this contract and is the recommended pickup.)
5. All existing impact tests (`test/tool-impact*.test.ts`, `test/extension-impact.test.ts`, `test/token-tracker-all-tools.test.ts`) continue to pass — no ordering-sensitive path regresses (`addition`, ambiguous, not-found, empty-body-no-dependents, ranking, performance, output-signals, trust-header).
6. The full test suite (`bun test`) passes on the fix branch.
