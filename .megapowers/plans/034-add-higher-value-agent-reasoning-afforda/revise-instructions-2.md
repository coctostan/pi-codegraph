# Revise Instructions (Iteration 2)

## Task 3: Shared signal computer — fix formatImpactWhy assertion

The second test's `candidate` node (`src/b.ts::candidate:1`) has zero outbound `calls` edges, so `fanOut=0`, which makes it a "leaf" per the implementation at line 489 of plan.md: `if (fanOut === 0) roles.push("leaf")`.

The `formatImpactWhy` strips "tested"/"untested" from structural roles, but keeps "leaf". So the output will include "leaf" before "fan-in".

**Fix line 394 of plan.md** (the `formatImpactWhy` assertion):

Change:
```ts
expect(formatImpactWhy(candidate, 0.75)).toBe("[fan-in:0, untested, co-change:7, chain-confidence:0.75]");
```

To:
```ts
expect(formatImpactWhy(candidate, 0.75)).toBe("[leaf, fan-in:0, untested, co-change:7, chain-confidence:0.75]");
```

This matches `formatImpactWhy`'s logic: `structuralRoles` = `["leaf"]` (filtered from `roles` = `["leaf", "untested"]`), then `fan-in:0`, then `coverageTag` = `"untested"`, then `co-change:7`, then `chain-confidence:0.75`.

## Task 4: Impact ranking test — include a1/a2/a3 in expected results

The test adds `a1`, `a2`, `a3` as callers of `api` to give `api` a `fanIn=3`. But the BFS also traverses INTO those nodes: `shared ← api ← a1/a2/a3`. All three appear as depth-2 behavioral dependents.

**Fix:** Update the test assertion to include the full 6 results. Under the `compareImpact` sort order:

1. `api` — breaking, fanIn=3, untested, coChange=1, chainConf=0.4
2. `worker` — breaking, fanIn=1, tested, coChange=9, chainConf=0.9
3. `downstream` — behavioral, fanIn=0, untested, coChange=0, chainConf=0.6
4. `a1` — behavioral, fanIn=0, untested, coChange=0, chainConf=0.4, file=src/api-extra.ts, name=a1
5. `a2` — behavioral, fanIn=0, untested, coChange=0, chainConf=0.4, file=src/api-extra.ts, name=a2
6. `a3` — behavioral, fanIn=0, untested, coChange=0, chainConf=0.4, file=src/api-extra.ts, name=a3

Replace the assertion with:
```ts
    expect(details.map((item) => ({
      name: item.name,
      classification: item.classification,
      depth: item.depth,
      chainConfidence: item.chainConfidence,
    }))).toEqual([
      { name: "api", classification: "breaking", depth: 1, chainConfidence: 0.4 },
      { name: "worker", classification: "breaking", depth: 1, chainConfidence: 0.9 },
      { name: "downstream", classification: "behavioral", depth: 2, chainConfidence: 0.6 },
      { name: "a1", classification: "behavioral", depth: 2, chainConfidence: 0.4 },
      { name: "a2", classification: "behavioral", depth: 2, chainConfidence: 0.4 },
      { name: "a3", classification: "behavioral", depth: 2, chainConfidence: 0.4 },
    ]);
```

## Task 5: Impact annotations — update existing extension-impact test

`test/extension-impact.test.ts` lines 48-50 use exact-line regexes:
```ts
expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?$/);
expect(out).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?\n$/);
```

After Task 5, the output line ends with `  [fan-in:0, untested, co-change:0, chain-confidence:0.80]` (caller has no is_exported, no co-change edges, confidence 0.8). These regexes will fail.

**Fix:** Add `test/extension-impact.test.ts` to `files_to_modify` and update the regexes to accept the trailing annotation:

```ts
expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1  \[fan-in:0, untested, co-change:0, chain-confidence:0\.80\]$/);
expect(out).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1  \[fan-in:0, untested, co-change:0, chain-confidence:0\.80\]\n$/);
```

Also update Step 3 description to mention updating the existing test file, and add `test/extension-impact.test.ts` to the task's `files_to_modify` list.

## Task 7: Trace tags — add missing calls edge

The `prod` node has zero outbound `calls` edges, making `fanOut=0`, which tags it as "leaf". So the actual tags are `[entry-point, leaf, tested]` but the test expects `[entry-point, tested]`. `toContain("[entry-point, tested]")` will fail because `[entry-point, leaf, tested]` doesn't contain the exact substring `[entry-point, tested]`.

**Fix:** Add a `calls` edge from `prod` to `helper` in the test setup, right after `store.addNode(helper)`:

```ts
store.addEdge({ source: prod.id, target: helper.id, kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "helper:2:1", content_hash: prod.content_hash }, created_at: 2 });
```

This gives prod `fanOut=1`, removing the "leaf" tag. Then prod's roles become `["entry-point", "tested"]`, matching the test expectation.

Also verify helper's expected tags: with the calls edge, helper now has `fanIn=1` (from prod), `fanOut=0` → leaf, not exported → no entry-point, no tested_by → untested. So `[leaf, untested]` is correct. ✅
