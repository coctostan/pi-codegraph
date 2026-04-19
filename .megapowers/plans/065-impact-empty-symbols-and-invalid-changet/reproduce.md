# Reproduction: `impact` empty `symbols[]` and invalid `changeType` return silent empty / throw instead of diagnostic

## Steps to Reproduce

Run the internal `impact(...)` function from `src/tools/impact.ts` with three problematic inputs:

1. **Empty array:** `impact({ symbols: [], changeType: "behavior_change", store, projectRoot, maxDepth: 5 })`
2. **Invalid changeType:** `impact({ symbols: ["shared"], changeType: "invalid_type" as any, store, projectRoot, maxDepth: 5 })`
3. **Undefined symbols:** `impact({ symbols: undefined as any, changeType: "behavior_change", store, projectRoot, maxDepth: 5 })`

Reproduction harness `test/repro-065.test.ts` (temporarily created, content below in Failing Test section) executed with `bun test test/repro-065.test.ts` on branch `fix/065-impact-empty-symbols-and-invalid-changet` (tip `59af359c` — the pre-drafted fix on `preserve/impact-empty-symbols-guard @ bf50c633` is **not yet applied**).

## Expected Behavior

Per issue #65 exit criteria:

- `symbols: []` → Trust-header-wrapped **error** mentioning `symbols` is required, with a minimal example.
- `symbols: undefined` (direct-call case) → same diagnostic error, not a TypeError.
- Invalid `changeType` → error listing the four valid literals (`signature_change`, `removal`, `behavior_change`, `addition`).

## Actual Behavior

### Case 1 — Empty `symbols: []`
Returns only the Trust header, with an empty body. Indistinguishable from "analysis completed; no dependents found":

```
## Trust
status: fresh
evidence: none  stale-files: 0/0

```
(length: 56 chars — header only, no error text, no mention of `symbols`)

Mechanism: `collectImpactDetails` loops `for (const symbol of symbols)` over an empty array → no seeds queued → `hits.length === 0` → `impact()` returns `prependTrustHeader("", { stats })` at `src/tools/impact.ts:166`.

### Case 2 — Invalid `changeType: "invalid_type"`
Also silently returns just the Trust header:

```
## Trust
status: fresh
evidence: none  stale-files: 0/0

```
(length: 56 chars)

Mechanism: `changeType` is not `"addition"`, so it bypasses the addition short-circuit (`src/tools/impact.ts:151`). It flows into `collectImpactDetails`, where `classify(changeType, depth)` falls through all branches (no `signature_change`/`removal`/`behavior_change`/`addition` match) and returns `null` for every neighbor (`src/tools/impact.ts:36-43`), so every edge is filtered out via `if (!classification) continue;` at line 104. Net result: zero hits, empty body, looks identical to "no dependents found".

### Case 3 — Undefined `symbols`
**Throws an uncaught TypeError** instead of returning a diagnostic:

```
TypeError: undefined is not an object (evaluating 'params.symbols')
      at impact (/Users/maxwellnewman/pi/workspace/pi-codegraph/src/tools/impact.ts:140:24)
```

Mechanism: `impact()` at line 140 does `for (const symbol of params.symbols)` with no prior guard. TypeBox prevents this at the tool boundary, but direct callers (tests, CODI, other integrations) crash.

## Evidence

Test output from `bun test test/repro-065.test.ts`:

```
test/repro-065.test.ts:
---BEGIN OUTPUT---
## Trust
status: fresh
evidence: none  stale-files: 0/0

---END OUTPUT---
length: 56
(pass) REPRO empty symbols[] [11.38ms]
---BEGIN OUTPUT---
## Trust
status: fresh
evidence: none  stale-files: 0/0

---END OUTPUT---
length: 56
(pass) REPRO invalid changeType [1.27ms]
THREW: 135 |   projectRoot: string;
136 |   maxDepth?: number;
137 | }): string {
138 |   const stats = params.store.getStatistics(params.projectRoot);
139 |
140 |   for (const symbol of params.symbols) {
                             ^
TypeError: undefined is not an object (evaluating 'params.symbols')
      at impact (/Users/maxwellnewman/pi/workspace/pi-codegraph/src/tools/impact.ts:140:24)
      at <anonymous> (/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-065.test.ts:64:17)

(pass) REPRO undefined symbols [3.79ms]

 3 pass
 0 fail
Ran 3 tests across 1 file. [146.00ms]
```

Relevant current source locations (no guards present):

- `src/tools/impact.ts:66-68` — `collectImpactDetails` takes `symbols` straight into the loop; no empty/undefined guard.
- `src/tools/impact.ts:131-149` — `impact()` entry; iterates `params.symbols` at line 140 before any validation; never rejects unknown `changeType` strings.
- `src/tools/impact.ts:36-43` — `classify()` returns `null` for unknown `changeType` values, silently dropping every edge.

## Environment

- Branch: `fix/065-impact-empty-symbols-and-invalid-changet` (off `main @ 59af359c`)
- Drafted fix exists at `preserve/impact-empty-symbols-guard @ bf50c633` but is **not yet applied** on this branch (confirmed via `git diff preserve/impact-empty-symbols-guard -- src/tools/impact.ts`).
- Runtime: Bun 1.3.11
- Project: pi-codegraph, TypeScript, `bun:test` runner (per `AGENTS.md`)
- OS: macOS (Darwin)

## Failing Test

**Not yet committed** — a throwaway reproduction harness was used and removed. The permanent regression test belongs at `test/tool-impact-empty-symbols.test.ts` (name fixed by issue #65) and will be authored during the implement phase. The preserved draft in `preserve/impact-empty-symbols-guard @ bf50c633` already contains a reference version with three cases (empty array, undefined symbols, invalid changeType) asserting on `## Trust`, `Error`, `symbols`/`changeType`.

Reproduction harness used during this phase (executed, then deleted):

```ts
// test/repro-065.test.ts (temp)
import { test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

test("REPRO empty symbols[]", () => {
  const projectRoot = join(tmpdir(), `repro-empty-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    const out = impact({ symbols: [], changeType: "behavior_change", store, projectRoot, maxDepth: 5 });
    console.log(out, "length:", out.length);
  } finally { store.close(); rmSync(projectRoot, { recursive: true, force: true }); }
});

test("REPRO invalid changeType", () => { /* seeds one node, passes changeType: "invalid_type" as any */ });
test("REPRO undefined symbols", () => { /* passes symbols: undefined as any — catches TypeError */ });
```

`impact()` signature used (from `src/tools/impact.ts:131-137`):

```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string
```

## Reproducibility

**Always.** All three cases reproduce deterministically on every run against the current `fix/065-impact-empty-symbols-and-invalid-changet` branch tip. No timing, environment, or state dependencies.
