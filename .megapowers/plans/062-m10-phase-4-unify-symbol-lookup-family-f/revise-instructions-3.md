## Task 1: Extract shared compact card renderer

The task currently collapses the regression run into Step 4. This plan requires 5 explicit steps.

Replace the tail of the task with:

```md
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-render-body.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing (all existing `test/tool-symbol-card-*.test.ts` stay green because `symbolCard()` is unchanged in this task).
```

Do not leave `bun test` under Step 4.

## Task 2: Extract shared legacy neighborhood renderer

This task is missing the explicit acceptance-criteria callout required by the review contract.

Add a `Covers ...` line immediately under the task header. Use the ACs this task actually owns:

```md
Covers AC 2, AC 10, AC 22.
```

Rationale from the existing task body:
- AC 2: it extracts a shared internal renderer export from `src/tools/symbol-graph.ts`
- AC 10: the new test compares `renderLegacyNeighborhoodBody(...).body` to the current standalone `symbolGraph(...)` body byte-for-byte
- AC 22: it adds the renderer-regression test

## Task 3: Make symbol_graph default to compact card

This task is not executable as written because it tells the implementer to land Task 3 and Task 4 atomically and accepts a temporarily red full suite. That violates the sequential TDD requirement.

### 1. Remove the atomic-landing workaround
Delete the scope-note text that says Task 3 and Task 4 are committed atomically or that Task 3's full-suite `bun test` may stay red until Task 4 lands.

Task 3 must reach GREEN on its own.

### 2. Do **not** update registered-tool `exec!` calls in Task 3
At current `src/index.ts:25-34`, the registered `symbol_graph` schema only accepts:

```ts
Type.Union([Type.Literal("contract")])
```

And at current `src/index.ts:212`, the execute path still casts to:

```ts
include: params.include as Array<"contract"> | undefined,
```

Because of that, the three `exec!` call changes in `test/tool-symbol-graph-lsp.test.ts` cannot safely be part of Task 3.

Move those three edits out of Task 3 and into Task 4, after Task 4 broadens the schema/cast to:

```ts
Type.Union([
  Type.Literal("neighborhood"),
  Type.Literal("contract"),
  Type.Literal("source"),
])
```

and:

```ts
include: params.include as Array<"neighborhood" | "contract" | "source"> | undefined,
```

For Task 3, only migrate direct `symbolGraph(...)` call sites that bypass the registered-tool schema.

### 3. Make the `test/tool-symbol-graph-include-schema.test.ts` edit concrete
That file currently does an exact `toBe(...)` against the old minimal neighborhood output at lines 62-64. Saying “expect compact-card sections instead” is too vague.

Replace the exact-string assertion with explicit compact-card assertions, for example:

```ts
const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
expect(withoutInclude).toContain("## foo (function)");
expect(withoutInclude).toContain("### Signature");
expect(withoutInclude).toContain("### Signals");

const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });
expect(withEmptyInclude).toBe(withoutInclude);
```

Keep the schema checks in that file unchanged until Task 4.

### 4. Fix the coverage callout
Task 3 changes the active base output for `include:["contract"]` from legacy neighborhood to compact card, so the carried-forward contract append regression is part of this task’s coverage.

Change the task header line to:

```md
Covers AC 3, AC 4, AC 5, AC 6, AC 7, AC 12, AC 13, AC 17, AC 18, AC 22.
```

The existing `test/tool-symbol-graph-contract-include.test.ts` already locks AC 12 / AC 13 via:
- `expect(withContract.startsWith(base)).toBe(true)`
- `expect(standaloneBody).toBe(rendered.body)`

### 5. Restore an explicit Step 5
Replace the tail with:

```md
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-default-card.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
```

## Task 4: Validate include values and preserve legacy neighborhood output

This task should own the registered-tool `include:["neighborhood"]` call-site updates that were previously placed in Task 3.

### 1. Move the three LSP `exec!` edits here
After the schema/cast broadening in `src/index.ts`, update the three registered-tool execute calls in `test/tool-symbol-graph-lsp.test.ts`:
- current line ~200 (`shared`)
- current line ~312 (`IWorker`)
- current line ~550 (`IWorker`)

Those are the calls that actually need the schema widened before `include: ["neighborhood"]` is legal.

### 2. Remove the atomic-landing note
Once Task 3 is fixed, Task 4 no longer needs text saying Task 3/Task 4 land atomically or that Task 3 may remain red.

Delete that note and describe Task 4 as a normal sequential GREEN step.

### 3. Restore an explicit Step 5
Replace the tail with:

```md
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-legacy-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
```

## Task 5: Add automated docs drift test and update public docs for unified symbol_graph

Step 2’s RED description is inaccurate.

`docs/tool-descriptions.md` already contains `internal-only \`symbol_search\`` today (current line 25), so do **not** claim that assertion is part of the initial failure.

Rewrite Step 2 so it names only the actual REDs:

- `README.md` still says the project exposes 7 public tools by default and still has `#### \`symbol_card\`` / `#### \`symbol_contract\`` subsections
- `ARCHITECTURE.md` still lists `symbol_card` / `symbol_contract` in the public surface and file-layout comments
- `docs/tool-descriptions.md` still says `7-tool default public surface`

A correct Step 2 block is:

```md
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts`
Expected: FAIL — Bun reports `expect(received).toContain(expected)` against `"5-tool default public surface"` and `expect(received).not.toContain(expected)` against the `README.md` / `ARCHITECTURE.md` `symbol_card` / `symbol_contract` references. The `internal-only \`symbol_search\`` assertion already passes before this task.
```

## Task 6: Append source sections from the shared source renderer

The task currently folds the regression run into Step 4. Make the 5-step structure explicit.

Replace the tail with:

```md
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-source-include.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing (existing `test/tool-symbol-card-source.test.ts` and other standalone card tests still green because the standalone `### Source` / `### Source [stale]` shape is preserved).
```

## Task 7: Remove standalone symbol_card and symbol_contract registrations

This task also needs an explicit Step 5.

Replace the tail with:

```md
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-wiring.test.ts test/tool-symbol-contract-wiring.test.ts test/extension-tool-descriptions.test.ts tests/ptc-metadata.test.ts test/token-tracker-wiring-check.test.ts test/tool-symbol-graph-default-card.test.ts test/tool-symbol-graph-legacy-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
```

## Task 8: Record AC 21 downstream audit artifact

The audit artifact is too broad for the work actually planned.

### 1. Do not claim all in-repo references are migrated unless you list them
The current proposed file says:

```md
- Inside this repository, all known references to the standalone `symbol_card` / `symbol_contract` public tools have been migrated ...
```

That sentence is not defensible without a concrete audit list. Replace the generic prose with a file-by-file audit record.

Use a structure like:

```md
# Downstream audit

## In-repo runtime / public-surface references audited
- `src/index.ts` — standalone `symbol_card` / `symbol_contract` registrations removed in Task 7.
- `test/tool-symbol-card-wiring.test.ts` — updated to assert non-registration.
- `test/tool-symbol-contract-wiring.test.ts` — updated to assert non-registration.
- `test/extension-tool-descriptions.test.ts` — expected default public surface reduced to 5 tools.
- `tests/ptc-metadata.test.ts` — removed from registered read-only tool list.
- `test/token-tracker-wiring-check.test.ts` — removed from expected default registrations.
- `README.md`, `ARCHITECTURE.md`, `docs/tool-descriptions.md` — public docs updated to describe `symbol_graph` as the unified lookup surface.

## Accepted out-of-scope breaks
- External downstream repo `pi-coding-tools` — known `symbol_card` / `symbol_contract` registered-tool references are intentionally not updated in this issue by explicit user direction.

## Non-runtime historical references intentionally left unchanged
- Historical roadmap / issue / changelog files under `.megapowers/` and `ROADMAP.md` are not active runtime consumers of registered tool names.
```

### 2. Fix the AC coverage line
This task should not claim AC 23 unless it actually runs the full suite.

Either:
- change the header to `Covers AC 21.`

or
- keep `AC 23` and add `bun test` to verification.

Given this is a `[no-test]` markdown-only task, the cleaner fix is to change the header to:

```md
Covers AC 21.
```

### 3. Keep verification aligned with a no-test task
If you drop AC 23 from this task, keep Step 2 as file existence + phrase check + typecheck:

```sh
test -f .megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md \
  && grep -q 'accepted out-of-scope break' .megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md \
  && bun run check
```

Do not leave the task claiming AC 23 without a full-suite verification command.
