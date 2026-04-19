# Reproduction: `impact` silently returns empty on empty `symbols[]` and on invalid `changeType`

## Steps to Reproduce

Run the following driver script against the current `main` (commit `59af359c`) — no cherry-pick of `preserve/impact-empty-symbols-guard`:

```ts
// repro-065.ts
import { SqliteGraphStore } from "./src/graph/sqlite.js";
import { impact, collectImpact } from "./src/tools/impact.js";

const store = new SqliteGraphStore();
try {
  // Case A — tool-surface impact() with empty symbols[]
  console.log(JSON.stringify(
    impact({ symbols: [], changeType: "behavior_change", store, projectRoot: process.cwd() })
  ));

  // Case B — collectImpact() with empty symbols[]
  console.log(JSON.stringify(
    collectImpact({ symbols: [], changeType: "behavior_change", store })
  ));

  // Case C — collectImpact() with undefined symbols (direct-call case)
  try {
    collectImpact({ symbols: undefined as any, changeType: "behavior_change", store });
  } catch (err: any) {
    console.log("THREW:", err?.message ?? String(err));
  }

  // Case D — collectImpact() with invalid changeType
  console.log(JSON.stringify(
    collectImpact({ symbols: ["foo"], changeType: "typo_change" as any, store })
  ));

  // Case E — impact() with a *resolvable* symbol but invalid changeType
  store.addNode({ id: "src/lib.ts::shared:1", kind: "function", name: "shared",
                  file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
  console.log(JSON.stringify(
    impact({ symbols: ["shared"], changeType: "typo_change" as any,
             store, projectRoot: process.cwd() })
  ));
} finally { store.close(); }
```

Run: `bun ./repro-065.ts` (script placed at repo root so relative imports resolve).

## Expected Behavior

Per the issue's exit criteria (`.megapowers/issues/065-impact-empty-symbols-and-invalid-changet.md` lines 34–40):

- **Case A** (`impact({ symbols: [], ... })`): Trust-header-wrapped error message stating that `symbols` is required, with a minimal error-path example.
- **Case B / C** (`collectImpact` with empty or `undefined` symbols): clean diagnostic thrown/returned identifying the missing input (not a silent `[]`, not a generic TypeError about property access).
- **Case D / E** (invalid `changeType`): diagnostic listing the four valid literals (`signature_change`, `removal`, `behavior_change`, `addition`).

## Actual Behavior

All five cases fail silently or cryptically:

| Case | Input | Output |
|------|-------|--------|
| A | `impact({ symbols: [], changeType: "behavior_change", ... })` | `"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n"` — Trust header only, body is empty. Visually indistinguishable from "no dependents found". |
| B | `collectImpact({ symbols: [], ... })` | `[]` — silent empty array. |
| C | `collectImpact({ symbols: undefined, ... })` | Throws `TypeError: undefined is not an object (evaluating 'symbols')` — raw JS error from the `for (const symbol of symbols)` loop, not a diagnostic. |
| D | `collectImpact({ symbols: ["foo"], changeType: "typo_change", ... })` | `[]` — silent empty. The internal `classify()` helper returns `null` for anything unknown, so the loop still walks the graph but produces no classified items. |
| E | `impact({ symbols: ["shared"], changeType: "typo_change", ... })` with a resolvable symbol seeded in the store | `"## Trust\nstatus: fresh\nevidence: tree-sitter  stale-files: 0/0\n"` — Trust header only; no diagnostic about the bogus `changeType`. |

## Evidence

Actual stdout from the driver above, run on commit `59af359c` with `bun run` (Bun 1.3.11, macOS arm64):

```
=== impact({ symbols: [], changeType: 'behavior_change' }) ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n"
---
=== collectImpact({ symbols: [] }) ===
[]
---
=== collectImpact({ symbols: undefined }) threw ===
undefined is not an object (evaluating 'symbols')
---
=== collectImpact invalid changeType ===
[]
=== impact invalid changeType ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nSymbol \"foo\" not found"
=== impact(valid symbol, invalid changeType) ===
"## Trust\nstatus: fresh\nevidence: tree-sitter  stale-files: 0/0\n"
```

### Relevant source locations (`src/tools/impact.ts`, commit `59af359c`)

- Lines 66–81 (`collectImpactDetails`): loops `for (const symbol of symbols)` with no empty-check and no `symbols == null` check — the direct cause of Case B (silent `[]`) and Case C (raw TypeError).
- Lines 36–43 (`classify`): returns `null` for any `changeType` not in the known set — the direct cause of Case D/E producing silent empty results instead of a diagnostic.
- Lines 131–156 (`impact` tool entry): iterates `params.symbols` directly and only handles `"addition"` as a special case; no guard for empty `symbols[]`, no guard for invalid `changeType`. This is the source of Case A and Case E returning only a Trust header.

### Related preserved fix

Branch `preserve/impact-empty-symbols-guard` (commit `bf50c633`, "wip: defensive guards for empty symbols[] and invalid changeType in impact") contains a drafted fix: +16 lines in `src/tools/impact.ts` and a new `test/tool-impact-empty-symbols.test.ts` (+83 lines). It is *not* merged on `main` — confirmed by running the reproduction on the current working tree and observing every symptom.

## Environment

- Repo: `pi-codegraph` on branch `main`, tip commit `59af359c` (`fix: clarify symbol_graph include contract (#42)`).
- Runtime: `Bun v1.3.11`, macOS arm64.
- Related preserved branch: `preserve/impact-empty-symbols-guard` @ `bf50c633`.
- No existing `test/tool-impact-empty-symbols.test.ts` on `main` (`ls test/ | grep -i impact` returns no such file).

## Failing Test

Not written yet in this phase — a failing regression test will be added during implement. The preserved branch already has a draft at `test/tool-impact-empty-symbols.test.ts`; it is expected to fail against current `main` because none of the five cases above produce the diagnostic messages the exit criteria require.

For now, the driver script above serves as the manual reproduction. The new test file will cover:

- Case A: `impact({ symbols: [], changeType: "behavior_change", ... })` — assert the returned string contains a `symbols`-required diagnostic under the Trust header.
- Case C: `collectImpact({ symbols: undefined, ... })` — assert a clean thrown `Error` (not the bare `TypeError`).
- Case D / E: invalid `changeType` — assert a diagnostic listing the four valid literals.

## Reproducibility

**Always.** All five symptoms reproduce deterministically on the first run against the clean current `main` tree; no timing, concurrency, or environmental dependencies are involved. The code paths involved are pure (no I/O, no async, no randomness) beyond an in-memory `SqliteGraphStore`.
