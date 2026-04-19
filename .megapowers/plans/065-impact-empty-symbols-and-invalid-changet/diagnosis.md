# Diagnosis

## Root Cause

Three missing input-validation guards in `src/tools/impact.ts`, all in the same file, each driving one or more of the five reproduced symptoms:

1. **`impact()` (tool entry, lines 131–156):** `params.symbols` is iterated with `for (const symbol of params.symbols)` on line 140 with **no `symbols == null` or `symbols.length === 0` guard** before the loop and before the downstream `collectImpactDetails` call. Because the `for…of` over an empty array completes without iterating, the function falls through to `collectImpactDetails`, which also short-circuits to `[]` (see cause #2), and then line 166 (`if (hits.length === 0) return prependTrustHeader("", { stats })`) returns just the Trust header with an empty body — visually identical to "no dependents found". No diagnostic ever reaches the caller.

2. **`collectImpactDetails()` (lines 66–81):** destructures `{ symbols, … }` and then iterates `for (const symbol of symbols)` (line 75) with **no empty/undefined guard**. When `symbols` is `undefined` the `for…of` throws a raw JavaScript `TypeError: undefined is not an object (evaluating 'symbols')`. When `symbols` is `[]`, the loop body never executes, the queue stays empty, the `while (queue.length > 0)` on line 85 never runs, and the function returns `[]` silently.

3. **`classify()` (lines 36–43):** the conditional chain covers the four known `ChangeType` literals and **falls through to `return null`** for any unknown string. Inside `collectImpactDetails`, `if (!classification) continue;` (line 104) then drops every candidate, so the walker produces no classified items and `detailsByNode` stays empty. There is **no validation of `changeType` up front**, at either the `collectImpactDetails` or `impact` layer. The TypeBox schema (`src/index.ts:54–62`) is the only gate and applies only at the MCP tool surface — so `impact()`/`collectImpact()` called directly from TypeScript (tests, future integrations, CODI) see a garbage `changeType` as "silently matches zero classifications".

Concrete evidence from the reproduction (`.megapowers/plans/065-impact-empty-symbols-and-invalid-changet/reproduce.md`, Evidence section):

```
impact({ symbols: [], ... })                       → "## Trust\n...\n"            (cause #1, then #2)
collectImpact({ symbols: [], ... })                → []                           (cause #2)
collectImpact({ symbols: undefined, ... })         → TypeError raw                (cause #2)
collectImpact({ ..., changeType: "typo_change" })  → []                           (cause #3)
impact({ symbols:["shared"], changeType:"typo_change" }) → "## Trust\n...\n"     (cause #3)
```

## Trace

I traced each reproduced symptom back to the `impact.ts` source:

### Case A — `impact({ symbols: [], changeType: "behavior_change", … })` → Trust header only

1. Symptom appears in the return of `impact()` line 179: `prependTrustHeader(body, { stats, hasLocalExceptions })` with `body = ""`.
2. `body` is empty because `lines.length === 0` (line 178) — no items were rendered.
3. `lines` is empty because `hits.length === 0` (line 166) sends us through `return prependTrustHeader("", { stats })`.
4. `hits` is the result of `collectImpactDetails({ symbols: [], … })` (lines 158–164).
5. Inside `collectImpactDetails` lines 75–81, the outer `for (const symbol of symbols)` loop has zero iterations; `queue` stays `[]`; the `while` on line 85 never runs; the function returns `[...detailsByNode.values()].sort(…)` = `[]`.
6. Walk back further — there is no empty-check at either layer. The empty-symbols path just sails through both functions, producing a "successful" zero-result response. **Root: missing guard in `impact()` (before line 140) and in `collectImpactDetails()` (before line 75).**

### Case B — `collectImpact({ symbols: [], … })` → `[]`

1. `collectImpact` (line 121) delegates directly to `collectImpactDetails` and `.map()`s the result.
2. Same trace as Case A steps 4–5 — `collectImpactDetails` returns `[]` with no diagnostic. **Root: same as Case A, the `collectImpactDetails` guard.**

### Case C — `collectImpact({ symbols: undefined, … })` → raw `TypeError`

1. `collectImpact` → `collectImpactDetails` destructures `symbols` (line 67), getting `undefined`.
2. Line 68: `if (changeType === "addition") return [];` — not taken.
3. Line 75: `for (const symbol of symbols)` — V8/Bun evaluates `symbols[Symbol.iterator]`, `symbols` is `undefined`, throws `TypeError: undefined is not an object (evaluating 'symbols')` from the `for…of` machinery itself.
4. There is no `try/catch` at the `impact()` call-site in `src/index.ts:290` (`finalizeReadOnlyOutput` wraps the text, not the throw), so the error would propagate up to the MCP tool executor. **Root: missing null-check at `collectImpactDetails` line 67 / line 75.**

### Case D — `collectImpact({ symbols: ["foo"], changeType: "typo_change" })` → `[]`

1. `collectImpactDetails` line 68: `"typo_change" === "addition"` → false, no short-circuit.
2. Lines 75–81 seed the queue with whatever `store.findNodes("foo")` returns (empty here). If something had matched, we'd walk the graph.
3. The per-neighbor classification at line 103: `const classification = classify(changeType, depth);` → `classify("typo_change", depth)`.
4. `classify` lines 36–43: `changeType === "addition"` → false; `=== "behavior_change"` → false; `=== "signature_change" || === "removal"` → false; **fall through to `return null` (line 42)**.
5. Back in the loop: line 104 `if (!classification) continue;` — every candidate is silently dropped. `detailsByNode` stays empty → returns `[]`. **Root: `classify()`'s `null` fallthrough silently swallows an invalid `changeType` instead of validating it up front.**

### Case E — `impact({ symbols: ["shared"], changeType: "typo_change" })` → Trust header only

1. `impact()` line 140 loop resolves `"shared"` fine (it's seeded in the store) — no ambiguity/not-found bail-out on lines 147–148.
2. Line 151: `params.changeType === "addition"` → false, no special-case return.
3. Line 158: `collectImpactDetails({ …, changeType: "typo_change" })` — identical to Case D's flow, returns `[]`.
4. Line 166: `hits.length === 0` → `prependTrustHeader("", { stats })`. **Root: same as Case D plus no `changeType` validation at the `impact()` entry.**

## Affected Code

All root causes live in one file: **`src/tools/impact.ts`** (commit `59af359c`).

- `classify(changeType, depth)` — **lines 36–43**. Null fallthrough for unknown `changeType`.
- `collectImpactDetails(params)` — **lines 66–81** (specifically the destructure on line 67 and the unguarded `for…of` on line 75). No empty/undefined check on `symbols`.
- `impact(params)` — **lines 131–156** (specifically the unguarded `for (const symbol of params.symbols)` on line 140 and the absence of a `changeType`-validation block between line 138 and line 140). No empty-symbols guard, no `changeType` guard.

Secondary surfaces (callers / consumers — not broken themselves, but depend on the broken behavior):
- `src/index.ts:290` — sole `impact()` caller in production code. TypeBox schema at `src/index.ts:50–66` already blocks non-literal `changeType` and non-array `symbols` at the MCP tool surface but **does not** reject empty arrays (arrays can be length 0 by default in TypeBox).
- `test/tool-impact.test.ts` — 5 tests using `collectImpact`, all with populated `symbols: ["shared"]` arrays and valid `changeType`. None exercise the empty-symbols or invalid-changeType paths, which is why the bug has persisted.

No fix is merged on `main`. The preserved branch `preserve/impact-empty-symbols-guard` (commit `bf50c633`) contains a draft +16-line fix in `src/tools/impact.ts` and an 83-line regression test at `test/tool-impact-empty-symbols.test.ts`. Spot-checked — the draft:

- Adds `if (!symbols || symbols.length === 0) return [];` inside `collectImpactDetails` (just a silent short-circuit, not a thrown diagnostic — so Case C would still throw a `TypeError` at the `for…of` if a direct caller wrapped `collectImpact` without hitting `impact()` first; actually no — the draft guards with `!symbols` so `undefined` is handled by the short-circuit as well).
- Adds `Error: 'symbols' parameter is required. … Example: impact({ symbols: ["functionName"], changeType: "behavior_change" })` at the `impact()` entry — Trust-header-wrapped.
- Adds a `validChangeTypes.includes(params.changeType)` check with `Error: Invalid changeType "X". Must be one of: signature_change, removal, behavior_change, addition`.
- Does **not** add a `changeType` guard to `collectImpactDetails` itself — an invalid `changeType` passed directly to `collectImpact(…)` still returns `[]` silently after the fix. Whether this counts as "internal-function validation" under exit criterion #3 depends on interpretation; the preserved fix treats `impact()` as the validation boundary. The issue text lines 37–38 calls for validation at *the internal `impact(…)` function layer*, so the preserved fix matches the issue's own wording.

## Pattern Analysis

Looking at sibling tools for the canonical diagnostic style:

- `src/tools/graph-query.ts:18`: `return prependTrustHeader("parse_error: query must not be empty\n", { stats });` — lowercase `kind:` prefix, Trust-header-wrapped, terse.
- `src/tools/graph-overview.ts:15`: `return prependTrustHeader("Graph is empty — index a project first.", { stats });` — prose diagnostic wrapped in Trust header.
- `src/tools/resolve-edge.ts:43–45`: `return "evidence is required — provide a non-empty explanation for this edge";` — plain string (this tool doesn't use Trust header), terse, uses `is required — provide …` pattern.
- `src/tools/symbol-resolution.ts` (via `resolveUniqueSymbol`): returns `{ kind: "not_found", text: … }` or `{ kind: "ambiguous", text: … }` — structured-result pattern, then the caller wraps in Trust header (see `impact.ts:147–148`).

**Differences between working sibling tools and the broken `impact()`:**

| Dimension | Sibling tools (working) | `impact()` (broken) |
|---|---|---|
| Input validation happens | At the tool entry, before any real work | Only the `"addition"` special case at line 151; empty / undefined / unknown-literal cases are unguarded |
| Diagnostic style | `kind:` prefix or `X is required — …` terse line, Trust-header-wrapped | Silent empty body under Trust header |
| Internal-function style | `resolveUniqueSymbol` returns a discriminated result | `collectImpactDetails` silently returns `[]` for any invalid input |
| Example in error | Not present in existing tools; issue spec says "minimal example in the error body" | Not present |

**Violated assumptions in the broken code:**

- `impact()` assumes `params.symbols` is a non-empty array. TypeBox enforces array-ness at the MCP surface but **not** non-emptiness. Direct TypeScript callers bypass TypeBox entirely.
- `collectImpactDetails()` assumes `symbols` is a defined, iterable value. `for…of` crashes on `undefined`.
- `classify()` assumes `changeType` is one of the four literals. The function's signature declares `changeType: ChangeType` (the union type), but TypeScript's nominal type `ChangeType` is not enforced at runtime — any string slips through cast as `any`, and the `null` fallthrough was clearly intended as a defensive escape for `"addition"` (see line 37: `if (changeType === "addition") return null;`), not as a silent swallow for unknown literals.

## Risk Assessment

**Direct callers of the affected symbols:**

- `impact()` — one production caller (`src/index.ts:290`) inside the MCP tool executor, 7 test files (`test/tool-impact*.test.ts` + `test/extension-impact.test.ts`). Adding early-return error strings keeps the return type (`string`) and Trust-header shape stable; risk of breaking existing tests is contained to tests that exercise the empty/invalid paths (none currently do on `main`, confirmed by `grep`).
- `collectImpact()` / `collectImpactDetails()` — six tests in `test/tool-impact.test.ts` all populate `symbols` with a non-empty array and valid `changeType`. Silent-short-circuit behavior for empty `symbols` in `collectImpactDetails` (as the preserved fix does) keeps those tests green; throwing instead would break none since none hit the path. Any future call-sites should prefer throwing so the boundary is loud; the preserved fix opts for silent short-circuit — this is a design choice worth flagging in plan review.
- `classify()` — called only from `collectImpactDetails` line 103. Not exported. Fixing invalid-`changeType` at an earlier layer (at `impact()` and/or `collectImpactDetails`) obviates any change here; `classify()` itself can stay as-is.

**What could break if we change this:**

1. Agents that rely on `impact({ symbols: [] })` returning "empty results" as a cheap probe. Unlikely — the current empty return is visually indistinguishable from "no dependents", so no reasonable agent depends on the difference.
2. Tests that pass `undefined` / unknown-literal values and expect `[]` or a `TypeError`. Grep for such callers returns none. **No risk surface here.**
3. The existing `"addition"` special case at `impact.ts:151–156` emits its own prose ("addition: impact analysis for additions is not yet supported …"). The new validation block must run **after** the `changeType === "addition"` check, or the `addition` path would incorrectly pass through the valid-list check (it *is* in the list) — that is fine. But **ordering matters**: empty-symbols check should come first (most generic), then `changeType` validation, then the `"addition"` special-case message, then the `symbols` resolution loop. The preserved fix orders them roughly this way but puts the `changeType` check before the symbol-resolution loop — worth re-reviewing at plan time.

**Related bugs sharing the same root cause:**

- Issue #042, #047 covered "symbol name resolves to zero nodes" — a different input-validation gap (the name is present but the graph has no match). The current issue is upstream of that: the name isn't even *provided*.
- Issue #037 covered generic tool-input validation gaps; this path was out of scope per the issue text lines 31–32.
- No other tool in `src/tools/` exhibits a `for…of` over an unguarded iterable. `graph-query.ts:18` and `resolve-edge.ts:43–45` already validate their equivalent inputs. This is an isolated gap in `impact.ts`.

## Fixed When

1. **Case A (empty array, tool entry):** `impact({ symbols: [], changeType: "behavior_change", store, projectRoot })` returns a string containing both `## Trust` and a diagnostic that mentions `symbols` and communicates it is required. Error body contains a minimal example (issue exit-criterion 5, "error-path only").
2. **Case B / C (empty or undefined, internal function):** `collectImpact({ symbols: [], changeType: "behavior_change", store })` and `collectImpact({ symbols: undefined, … })` both return a well-defined value or throw a clean `Error` with a `symbols`-required message — not a raw `TypeError: undefined is not an object`. (The preserved fix silently returns `[]` in this path; plan should decide between "silent `[]`" and "thrown diagnostic" — the issue exit-criterion #2 says "returns same error", implying visible diagnostic is preferred, but the preserved fix diverges. **Flagged for plan review.**)
3. **Case D / E (invalid `changeType`, internal function):** `impact({ symbols: ["shared"], changeType: "typo_change" as any, … })` with a resolvable symbol returns a diagnostic listing the four valid literals. `collectImpact({ ..., changeType: "typo_change" as any })` likewise surfaces a diagnostic (throw or result-with-error). Issue exit-criterion #3: "Invalid `changeType` **at the internal function layer** returns a message listing valid values."
4. All existing `impact` test files (`test/tool-impact.test.ts`, `test/tool-impact-ambiguous.test.ts`, `test/tool-impact-empty-output.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-performance.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-trust-header.test.ts`, `test/extension-impact.test.ts`) still pass.
5. New regression test file `test/tool-impact-empty-symbols.test.ts` lands green, covering at minimum: empty-array input, `undefined` symbols input, and invalid `changeType` string (per issue exit-criterion #4 and the three cases drafted on `preserve/impact-empty-symbols-guard`).
6. Error message for empty-symbols contains a minimal invocation example in the error body (per issue exit-criterion #5).
