## Test Suite Results

### Full suite
Command: `bun test`

Actual output summary:
```text
bun test v1.3.11 (af24e281)
...
443 pass
0 fail
1346 expect() calls
Ran 443 tests across 187 files. [10.51s]
```

### Typecheck
Command: `bun run check`

Actual output:
```text
$ tsc --noEmit
```
Exit code: 0.

### Build
Command: `bun run build`

Actual output:
```text
$ echo "nothing to build"
nothing to build
```
Exit code: 0.

### Bugfix reproduction applicability
Command: `read .megapowers/issues/062-m10-phase-4-unify-symbol-lookup-family-f.md`

Evidence:
- `.megapowers/issues/062-m10-phase-4-unify-symbol-lookup-family-f.md:2-4` shows `id: 62`, `type: feature`, `status: in-progress`.

Verdict: Step 1b is not applicable. This issue is a feature, not a bugfix.

## Additional Verification Commands

### A. Public tool registry
Command: `bun -e '<register tools and print tool names>'`

Actual output:
```json
[
  "symbol_graph",
  "resolve_edge",
  "delete_edge",
  "impact",
  "trace"
]
```

### B. Include schema validation
Command: `bun -e '<Value.Check on symbol_graph schema>'`

Actual output:
```json
{
  "allowedNeighborhood": true,
  "allowedContract": true,
  "allowedSource": true,
  "rejectedSignals": false,
  "rejectedWat": false
}
```

### C. Live `symbol_graph` output sample
Command: `bun -e '<construct fixture and print default/include outputs>'`

Actual output excerpts:
```text
=== default ===
## foo (function)
src/a.ts:3:d898

### Signature
(input: string) => number

### Covering Tests (1)
  test/foo.test.ts:1:dce7  "foo works"

### Key Relationships
  Callees (1):  bar
    bar: () => number

### Signals
[entry-point, tested]

=== include-empty ===
## foo (function)
src/a.ts:3:d898

### Signature
(input: string) => number

### Covering Tests (1)
  test/foo.test.ts:1:dce7  "foo works"

### Key Relationships
  Callees (1):  bar
    bar: () => number

### Signals
[entry-point, tested]

=== neighborhood ===
## foo (function)
src/a.ts:3:d898 [entry-point, tested]
### Callees
  src/b.ts:1:4101  bar  calls  confidence:0.5  tree-sitter [leaf, untested]

### Tests
  test/foo.test.ts:1:dce7  foo works  tested_by  confidence:0.9  coverage [leaf, untested]

=== neighborhood+contract+source ===
## foo (function)
src/a.ts:3:d898 [entry-point, tested]
### Callees
  src/b.ts:1:4101  bar  calls  confidence:0.5  tree-sitter [leaf, untested]

### Tests
  test/foo.test.ts:1:dce7  foo works  tested_by  confidence:0.9  coverage [leaf, untested]

## Contract: foo
...

### Source
3:d898|export function foo(input: string): number {
...

=== not-found ===
Symbol "missing" not found

Symbol "missing" not found
```

### D. Live ambiguous output sample
Command: `bun -e '<construct ambiguous fixture and print default/contract/source outputs>'`

Actual output:
```text
=== contract ambiguous ===
Multiple matches for "foo":

  src/a.ts:1:9e33  foo (function)  src/a.ts
  src/b.ts:1:2c80  foo (class)  src/b.ts

Multiple matches for "foo":

  src/a.ts:1:9e33  foo (function)  src/a.ts
  src/b.ts:1:2c80  foo (class)  src/b.ts

=== source ambiguous ===
Multiple matches for "foo":

  src/a.ts:1:9e33  foo (function)  src/a.ts
  src/b.ts:1:2c80  foo (class)  src/b.ts

Multiple matches for "foo":

  src/a.ts:1:9e33  foo (function)  src/a.ts
  src/b.ts:1:2c80  foo (class)  src/b.ts

=== default ambiguous ===
Multiple matches for "foo":

  src/a.ts:1:9e33  foo (function)  src/a.ts
  src/b.ts:1:2c80  foo (class)  src/b.ts
```

### E. No public registration of removed tools in source
Commands:
- `grep 'name: "symbol_card"' src --literal`
- `grep 'name: "symbol_contract"' src --literal`

Actual outputs:
```text
[0 matches in 0 files]
[0 matches in 0 files]
```

### F. Snapshot files
Commands:
- `find . -pattern '*.snap'`

Actual output:
```text
No files found matching pattern: *.snap
```

## Per-Criterion Verification

### Criterion 1: The public tool registry exposes `symbol_graph` as the only registered symbol lookup/inspection tool, and neither `symbol_card` nor `symbol_contract` is registered.
**Evidence:**
- Additional Verification A shows the registered default tool list is exactly `symbol_graph`, `resolve_edge`, `delete_edge`, `impact`, `trace`.
- Additional Verification E shows no `name: "symbol_card"` or `name: "symbol_contract"` registrations exist under `src/`.
- `src/index.ts:175-211` registers `symbol_graph`; no other symbol-inspection tool is registered there.
- Fresh targeted test run:
  ```text
  bun test test/tool-symbol-card-wiring.test.ts test/tool-symbol-contract-wiring.test.ts test/extension-tool-descriptions.test.ts test/token-tracker-wiring-check.test.ts test/extension-symbol-search.test.ts
  (pass) pi extension no longer registers symbol_card and keeps internal renderers exported
  (pass) pi extension no longer registers symbol_contract and keeps renderSymbolContractBody exported
  (pass) symbol_search is no longer registered in the extension surface
  (pass) pi extension registers the approved descriptions for the 5 default public tools
  (pass) the default public tools are registered in the pi extension
  ```
**Verdict:** pass

### Criterion 2: The card, contract, and source section renderers remain available as shared internal module APIs callable by `symbol_graph` and existing internal consumers/tests, and `symbol_graph` uses those shared APIs instead of duplicating equivalent rendering logic.
**Evidence:**
- `src/tools/symbol-card.ts:25-47` exports `renderSymbolSourceSection(...)`.
- `src/tools/symbol-card.ts:49-118` exports `renderSymbolCardBody(...)`.
- `src/tools/symbol-contract.ts:68-166` exports `renderSymbolContractBody(...)`.
- `src/tools/symbol-graph.ts:12-13` imports those helpers, and `src/tools/symbol-graph.ts:175-203` uses them as the base/append rendering path.
- Fresh targeted test run:
  ```text
  bun test test/tool-symbol-card-wiring.test.ts test/tool-symbol-contract-wiring.test.ts test/tool-symbol-graph-render-neighborhood-body.test.ts test/tool-symbol-graph-contract-include.test.ts test/tool-symbol-graph-source-include.test.ts
  (pass) pi extension no longer registers symbol_card and keeps internal renderers exported
  (pass) pi extension no longer registers symbol_contract and keeps renderSymbolContractBody exported
  (pass) renderLegacyNeighborhoodBody is exported and matches the current standalone neighborhood output
  (pass) symbolGraph appends the standalone symbol_contract body when include contains contract
  (pass) symbolCard routes its Source section through renderSymbolSourceSection for AC 15
  ```
**Verdict:** pass

### Criterion 3: Calling `symbol_graph` without an `include` argument returns a compact card-style base view.
**Evidence:**
- Additional Verification C default output starts with:
  ```text
  ## foo (function)
  src/a.ts:3:d898

  ### Signature
  ...
  ### Covering Tests (1)
  ...
  ### Key Relationships
  ...
  ### Signals
  [entry-point, tested]
  ```
- `src/tools/symbol-graph.ts:174-182` selects `renderSymbolCardBody(...)` when `include` does not contain `"neighborhood"`.
- Fresh targeted test run:
  ```text
  bun test test/tool-symbol-card-render-body.test.ts test/tool-symbol-graph-default-card.test.ts
  (pass) renderSymbolCardBody returns the compact card base view without Source or Exported
  (pass) symbolGraph defaults to a compact card and include:[] matches omitted include
  ```
**Verdict:** pass

### Criterion 4: Calling `symbol_graph` with `include: []` returns the same output as omitting `include`.
**Evidence:**
- Additional Verification C shows the `=== default ===` and `=== include-empty ===` blocks are identical.
- `test/tool-symbol-graph-default-card.test.ts:43-46` asserts `expect(withoutInclude).toBe(withEmptyInclude)`.
- Fresh targeted test output:
  ```text
  bun test test/tool-symbol-graph-default-card.test.ts
  (pass) symbolGraph defaults to a compact card and include:[] matches omitted include
  ```
**Verdict:** pass

### Criterion 5: The default card-style base view includes symbol identity/definition, signature, inline signals, a top relationship summary, and covering tests.
**Evidence:**
- Additional Verification C default output includes:
  - identity/definition: `## foo (function)`
  - signature: `### Signature`
  - covering tests: `### Covering Tests (1)`
  - relationship summary: `### Key Relationships` / `Callees (1): bar`
  - inline signals: `[entry-point, tested]`
- `src/tools/symbol-card.ts:75-112` renders those exact sections.
- `test/tool-symbol-card-render-body.test.ts:44-49` asserts those sections are present.
**Verdict:** pass

### Criterion 6: The default card-style base view omits the legacy `Exported` section.
**Evidence:**
- Additional Verification C default output contains no `### Exported` section.
- `src/tools/symbol-card.ts:75-118` does not render `Exported` in `renderSymbolCardBody(...)`; the legacy standalone `symbolCard(...)` still renders it later at `src/tools/symbol-card.ts:171-174`.
- `test/tool-symbol-card-render-body.test.ts:50-51` asserts `rendered.body` does not contain `### Exported`.
**Verdict:** pass

### Criterion 7: The default base view remains compact: contract and source sections are absent unless explicitly requested through `include`.
**Evidence:**
- Additional Verification C default output contains no contract section and no source section.
- `src/tools/symbol-graph.ts:185-203` appends contract/source only when `include` contains those values.
- `test/tool-symbol-graph-default-card.test.ts:52-58` asserts default output contains neither `### Contract` nor `### Source` and also has no migration text.
**Verdict:** pass

### Criterion 8: The `symbol_graph.include` schema accepts only `"neighborhood"`, `"contract"`, and `"source"` values; any other value fails schema validation.
**Evidence:**
- `src/index.ts:26-35` defines `include` as a union of exactly `"neighborhood"`, `"contract"`, and `"source"`.
- Additional Verification B shows schema checks return `true` for those three and `false` for `"signals"` and `"wat"`.
- Fresh targeted test output:
  ```text
  bun test test/tool-symbol-graph-include-schema.test.ts test/tool-symbol-graph-legacy-neighborhood.test.ts
  (pass) symbol_graph accepts include values for neighborhood, contract, and source and keeps default output byte-identical
  (pass) symbol_graph schema accepts only neighborhood, contract, and source includes
  ```
**Verdict:** pass

### Criterion 9: `include: ["neighborhood"]` selects the legacy full-neighborhood `symbol_graph` view as the base output.
**Evidence:**
- `src/tools/symbol-graph.ts:174-177` sets `useNeighborhoodBase` and uses `renderLegacyNeighborhoodBody(params)` when `include` contains `"neighborhood"`.
- Additional Verification C `=== neighborhood ===` block is the full neighborhood view with `### Callees` and `### Tests`, not the compact card.
- Fresh targeted test output:
  ```text
  bun test test/tool-symbol-graph-legacy-neighborhood.test.ts
  (pass) include:['neighborhood'] returns the byte-identical legacy body and stays the active base when combined
  ```
**Verdict:** pass

### Criterion 10: For the same input, `include: ["neighborhood"]` produces byte-identical output to the pre-change legacy `symbol_graph` output.
**Evidence:**
- `test/tool-symbol-graph-render-neighborhood-body.test.ts:31-35` asserts `expect(standaloneBody).toBe(rendered.body)`.
- `test/tool-symbol-graph-legacy-neighborhood.test.ts:60-70` asserts `expect(neighborhood).toBe(expected)` where `expected` is the preserved legacy renderer body.
- Fresh targeted test output:
  ```text
  bun test test/tool-symbol-graph-render-neighborhood-body.test.ts test/tool-symbol-graph-legacy-neighborhood.test.ts
  (pass) renderLegacyNeighborhoodBody is exported and matches the current standalone neighborhood output
  (pass) include:['neighborhood'] returns the byte-identical legacy body and stays the active base when combined
  ```
- Additional Verification C shows the printed `=== neighborhood ===` block and the printed `=== legacy-shared ===` block are the same body.
**Verdict:** pass

### Criterion 11: When `"neighborhood"` is combined with other includes, the neighborhood view remains the base output.
**Evidence:**
- `src/tools/symbol-graph.ts:174-203` chooses the base first, then appends contract/source after that base.
- `test/tool-symbol-graph-legacy-neighborhood.test.ts:62-70` asserts `combined.startsWith(expected) === true`.
- `test/tool-symbol-graph-source-include.test.ts:45-53` asserts `include:['neighborhood','source']` starts with the neighborhood body.
- Additional Verification C `=== neighborhood+contract+source ===` starts with the neighborhood block before contract/source appendages.
**Verdict:** pass

### Criterion 12: `include: ["contract"]` appends a contract section to the active base output and does not replace that base output.
**Evidence:**
- `src/tools/symbol-graph.ts:185-193` appends `renderedContract.body` to the existing `body`.
- `test/tool-symbol-graph-contract-include.test.ts:82-90` asserts `withContract.startsWith(base)` and that the remainder equals the standalone contract body.
- Fresh targeted test output:
  ```text
  bun test test/tool-symbol-graph-contract-include.test.ts
  (pass) symbolGraph appends the standalone symbol_contract body when include contains contract
  ```
**Verdict:** pass

### Criterion 13: The appended contract section is produced by the same extraction/rendering path that previously powered `symbol_contract`.
**Evidence:**
- `src/tools/symbol-graph.ts:13` imports `renderSymbolContractBody` from `./symbol-contract.js`.
- `src/tools/symbol-graph.ts:185-193` appends the result of that helper.
- `test/tool-symbol-graph-contract-include.test.ts:83-90` asserts the shared helper body equals the standalone `symbolContract(...)` body and that the appended section is exactly that body.
**Verdict:** pass

### Criterion 14: `include: ["source"]` appends a source section to the active base output and does not replace that base output.
**Evidence:**
- `src/tools/symbol-graph.ts:195-203` appends `renderedSource.body` to the current base body.
- `test/tool-symbol-graph-source-include.test.ts:33-39` asserts `withSource.startsWith(base)` and the suffix equals the shared source section body.
- Fresh targeted test output:
  ```text
  bun test test/tool-symbol-graph-source-include.test.ts
  (pass) include:['source'] appends the shared source section to the compact card base
  ```
**Verdict:** pass

### Criterion 15: The appended source section is produced by the same source-snippet rendering path previously used for card/source output.
**Evidence:**
- `src/tools/symbol-card.ts:25-47` exports `renderSymbolSourceSection(...)`.
- `src/tools/symbol-graph.ts:195-203` appends the output of `renderSymbolSourceSection(...)`.
- `src/tools/symbol-card.ts:156-164` shows standalone `symbolCard(...)` also uses the same helper.
- `test/tool-symbol-graph-source-include.test.ts:108-116` asserts the standalone card output contains `renderSymbolSourceSection(...).body`, proving shared renderer reuse.
**Verdict:** pass

### Criterion 16: When both `"contract"` and `"source"` are requested, each section appends after the active base output, whether the base is the default card or the neighborhood view.
**Evidence:**
- `test/tool-symbol-graph-source-include.test.ts:59-67` asserts `contractIdx > -1` and `sourceIdx > contractIdx` for `include:['contract','source']`.
- `test/tool-symbol-graph-source-include.test.ts:45-53` asserts `include:['neighborhood','source']` keeps neighborhood as the base and appends source after it.
- Additional Verification C `=== neighborhood+contract+source ===` shows neighborhood output first, then `## Contract: foo`, then `### Source`.
**Verdict:** pass

### Criterion 17: A not-found lookup returns explicit not-found output, not an empty result or unhandled failure, for both the default card base and include-driven requests.
**Evidence:**
- `src/tools/symbol-card.ts:53-55`, `src/tools/symbol-card.ts:28-30`, `src/tools/symbol-contract.ts:71-73`, and `src/tools/symbol-graph.ts:104-106` all return explicit `Symbol "..." not found` bodies.
- `test/tool-symbol-graph-default-card.test.ts:77` asserts default-base not-found output.
- `test/tool-symbol-graph-source-include.test.ts:73-77` asserts include-driven source not-found output.
- `test/tool-symbol-graph-contract-include.test.ts:100-107` asserts include-driven contract not-found output is appended explicitly.
- Additional Verification C `=== not-found ===` prints explicit not-found text.
**Verdict:** pass

### Criterion 18: An ambiguous lookup returns explicit ambiguity output, not an empty result or unhandled failure, for both the default card base and include-driven requests.
**Evidence:**
- `src/tools/symbol-card.ts:56-64`, `src/tools/symbol-card.ts:31-38`, `src/tools/symbol-contract.ts:74-83`, and `src/tools/symbol-graph.ts:107-117` all build explicit `Multiple matches for "..."` bodies.
- `test/tool-symbol-graph-default-card.test.ts:78-81` asserts explicit ambiguity output for the default base.
- `test/tool-symbol-graph-source-include.test.ts:99-102` asserts explicit ambiguity output for include-driven source requests.
- Additional Verification D shows explicit ambiguity output for default, contract include, and source include requests.
**Verdict:** pass

### Criterion 19: Tool output contains no deprecation warnings or migration ceremony for the removed standalone tools.
**Evidence:**
- `test/tool-symbol-graph-default-card.test.ts:55-58` asserts default output does not contain `deprecated`, `use symbol_graph instead`, `symbol_card(`, or `symbol_contract(`.
- `test/tool-symbol-graph-legacy-neighborhood.test.ts:66-69` asserts the same for the neighborhood output.
- Additional Verification C output excerpts contain no deprecation or migration text.
- Fresh targeted test output:
  ```text
  bun test test/tool-symbol-graph-default-card.test.ts test/tool-symbol-graph-legacy-neighborhood.test.ts
  (pass) symbolGraph defaults to a compact card and include:[] matches omitted include
  (pass) include:['neighborhood'] returns the byte-identical legacy body and stays the active base when combined
  ```
**Verdict:** pass

### Criterion 20: `README.md`, `ARCHITECTURE.md`, and public tool-description sources are updated to describe `symbol_graph` as the single public lookup tool and to document the default, neighborhood, contract, and source usage patterns.
**Evidence:**
- `README.md:11-15` documents `symbol_graph` default, neighborhood, contract, and source usage.
- `README.md:21-23` says the default public surface is 5 tools and `symbol_search` is internal-only.
- `README.md:65-76` shows only `symbol_graph` lookup examples and no public `symbol_card` / `symbol_contract` tool sections.
- `ARCHITECTURE.md:9-13` shows the public surface, and `ARCHITECTURE.md:59` says `symbol_graph` is the unified public symbol lookup surface.
- `docs/tool-descriptions.md:24-26` says `src/index.ts` is the source of truth for the 5-tool default public surface and `symbol_search` remains internal-only.
- Fresh targeted test output:
  ```text
  bun test test/docs-symbol-graph-unified-surface.test.ts
  (pass) public docs describe symbol_graph as the unified lookup surface
  ```
**Verdict:** pass

### Criterion 21: Known downstream references to `symbol_card` and `symbol_contract` as registered tools are audited before completion; each audited reference is either updated to equivalent `symbol_graph` usage or explicitly recorded as an accepted out-of-scope break.
**Evidence:**
- `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md:2-9` lists audited in-repo runtime/public-surface references updated for the unified surface.
- `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md:11-12` records the external `pi-coding-tools` reference as the accepted out-of-scope break.
- `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md:14-15` explicitly excludes historical roadmap/issue/changelog references from runtime scope.
**Verdict:** pass

### Criterion 22: Automated tests are updated to cover tool registration, include schema, default and empty-include card output, legacy neighborhood regression, append behavior, not-found handling, ambiguous handling, shared renderer reuse, documentation/tool-description drift, and snapshot updates where output changes.
**Evidence:**
- Fresh targeted test runs in this session passed for all required coverage areas:
  ```text
  bun test test/tool-symbol-card-wiring.test.ts test/tool-symbol-contract-wiring.test.ts test/extension-tool-descriptions.test.ts test/token-tracker-wiring-check.test.ts test/extension-symbol-search.test.ts
  bun test test/tool-symbol-card-render-body.test.ts test/tool-symbol-graph-default-card.test.ts
  bun test test/tool-symbol-graph-include-schema.test.ts test/tool-symbol-graph-legacy-neighborhood.test.ts test/tool-symbol-graph-render-neighborhood-body.test.ts
  bun test test/tool-symbol-graph-contract-include.test.ts test/tool-symbol-graph-source-include.test.ts
  bun test test/docs-symbol-graph-unified-surface.test.ts
  ```
  Each command returned only passing tests.
- Specific test files and covered areas:
  - registration: `test/tool-symbol-card-wiring.test.ts`, `test/tool-symbol-contract-wiring.test.ts`, `test/token-tracker-wiring-check.test.ts`, `test/extension-symbol-search.test.ts`
  - include schema: `test/tool-symbol-graph-include-schema.test.ts`, `test/tool-symbol-graph-legacy-neighborhood.test.ts`
  - default + empty include: `test/tool-symbol-graph-default-card.test.ts`
  - compact renderer reuse: `test/tool-symbol-card-render-body.test.ts`
  - legacy neighborhood regression: `test/tool-symbol-graph-render-neighborhood-body.test.ts`, `test/tool-symbol-graph-legacy-neighborhood.test.ts`
  - append behavior / reuse: `test/tool-symbol-graph-contract-include.test.ts`, `test/tool-symbol-graph-source-include.test.ts`
  - docs/tool-description drift: `test/docs-symbol-graph-unified-surface.test.ts`, `test/extension-tool-descriptions.test.ts`
- Additional Verification F shows the repo has no `.snap` files, so output regressions are covered by explicit byte-equality and string assertions rather than snapshot artifacts.
**Verdict:** pass

### Criterion 23: The full existing test suite passes after the change.
**Evidence:**
- Full-suite command `bun test` completed in this session with:
  ```text
  443 pass
  0 fail
  1346 expect() calls
  Ran 443 tests across 187 files. [10.51s]
  ```
**Verdict:** pass

## Overall Verdict
pass

All 23 acceptance criteria are met by direct code inspection, fresh targeted verification commands, and a fresh full test-suite run. The implementation satisfies the spec as written.