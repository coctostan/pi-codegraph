# Diagnosis

## Root Cause

Two distinct bugs in `src/tools/impact.ts`, both in the `impact()` rendering function (the tool output layer). The data layer (`collectImpactDetails`/`collectImpact`) is correct — the bugs are purely in how the output wrapper communicates results to the agent.

### Bug #042 — Not-found symbol: discarded diagnostic text
**Line 148:** `return prependTrustHeader("", { stats })` passes an empty string instead of `resolved.text`.

`resolveUniqueSymbol` returns `{ kind: "not_found", text: 'Symbol "nonExistentSymbol_ZZZ" not found' }` — the diagnostic text exists but is discarded. The ambiguous branch on line 147 correctly uses `resolved.text`, but the not_found branch ignores it.

This is a copy-paste inconsistency. Someone wrote the ambiguous case correctly, then wrote the not_found case with `""` instead of `resolved.text`.

### Bug #043 — Addition change type: missing diagnostic at rendering layer
**Line 68:** `collectImpactDetails` returns `[]` for addition (correct at data layer).
**Line 160:** `if (hits.length === 0) return prependTrustHeader("", { stats })` treats zero hits as "no impact" with empty body.

The rendering layer doesn't distinguish between "zero impact found" and "analysis not supported for this change type." The `addition` early-return at the data layer is fine — the problem is the `impact()` function doesn't check for `addition` before rendering the empty result.

## Trace

### Bug #042
```
impact({ symbols: ["nonExistentSymbol_ZZZ"], ... })
  → resolveUniqueSymbol({ name: "nonExistentSymbol_ZZZ", ... })
    → store.findNodes("nonExistentSymbol_ZZZ") → [] (empty)
    → returns { kind: "not_found", text: 'Symbol "nonExistentSymbol_ZZZ" not found' }
  → line 148: if (resolved.kind === "not_found") return prependTrustHeader("", { stats })
                                                                           ^^ BUG: ignores resolved.text
  → output: "## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n"
```

### Bug #043
```
impact({ symbols: ["shared"], changeType: "addition", ... })
  → resolveUniqueSymbol({ name: "shared", ... }) → { kind: "unique", node: ... }  (symbol exists, passes check)
  → collectImpactDetails({ ..., changeType: "addition", ... })
    → line 68: if (changeType === "addition") return []  (correct at data layer)
  → hits = []
  → line 160: if (hits.length === 0) return prependTrustHeader("", { stats })
                                                                ^^ BUG: no distinction between "zero impact" and "unsupported"
  → output: "## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n"
```

## Affected Code

- `src/tools/impact.ts:148` — not_found branch discards `resolved.text`
- `src/tools/impact.ts:160` — zero-hits branch doesn't check if the change type was unsupported

## Pattern Analysis

### Three tools, three patterns for not-found:

| Tool | File | Not-found handling | Correct? |
|------|------|--------------------|----------|
| `symbolGraph` | `symbol-graph.ts:71-72` | `return prependTrustHeader('Symbol "${name}" not found', { stats })` — inline message, doesn't use `resolveUniqueSymbol` | ✅ |
| `trace` | `trace.ts:105-106` | `return prependTrustHeader(resolved.text, { stats })` — uses `resolved.text` | ✅ |
| `impact` | `impact.ts:148` | `return prependTrustHeader("", { stats })` — discards `resolved.text` | ❌ |

The fix for #042 is trivial: change `""` to `resolved.text` on line 148, matching the `trace.ts` pattern.

### Zero-hits rendering:

| Scenario | Current output body | Should output |
|----------|-------------------|---------------|
| Valid symbol, has dependents | anchored lines | anchored lines ✅ |
| Valid symbol, no dependents | `""` (empty) | `""` (empty) ✅ — zero impact is valid |
| Valid symbol, addition change type | `""` (empty) | diagnostic message ❌ |

The fix for #043 needs to distinguish "zero dependents found" from "analysis not supported." This requires either:
- Checking `changeType === "addition"` before calling `collectImpactDetails` and returning a diagnostic, or
- Checking after the call but before the empty-hits render

## Risk Assessment

### What depends on the affected code?

- `test/extension-impact.test.ts:50-52` — tests `addition` change type, asserts `## Trust` present and `caller` not present. Does NOT assert the body is empty. The test will still pass with a diagnostic message added.
- `test/tool-impact.test.ts:82,89,97,166` — tests `collectImpact` (data layer), not the `impact()` rendering function. Unaffected.
- No other code calls `impact()` directly — it's the tool entry point.

### What could break?
- If the fix changes the output format for empty results, any agent that parses impact output might need updating. But since the output is currently empty (no parseable content), adding content can only help.
- The `collectImpactDetails` / `collectImpact` functions should NOT change — they correctly return `[]` for additions at the data layer. Only the rendering layer needs changes.

### Related patterns?
- No other tools have the same bug. `symbolGraph` and `trace` both handle not-found correctly.

## Fixed When

1. `impact(["nonExistentSymbol_ZZZ"], "behavior_change")` output body contains `Symbol "nonExistentSymbol_ZZZ" not found`
2. `impact(["shared"], "addition")` output body contains a diagnostic message explaining that addition analysis is not yet supported
3. Existing tests continue to pass (data layer `collectImpact` still returns `[]` for addition)
4. Both failing tests in `test/tool-impact-empty-output.test.ts` pass
